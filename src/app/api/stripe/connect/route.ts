import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getUserById, updateUserStripeAccount, getProviderOnboardingState, getProviderByStripeAccountId } from "@/lib/db";
import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * POST /api/stripe/connect
 * Create a Stripe Connect Express account for a provider and return the onboarding link.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "provider") {
      return NextResponse.json({ error: "Only providers can connect a Stripe account" }, { status: 403 });
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";

    // Determine redirect base based on onboarding state
    const onboardingState = await getProviderOnboardingState(user.id);
    const isOnboarding = onboardingState && !onboardingState.complete;
    const refreshUrl = isOnboarding
      ? `${appUrl}/provider-onboarding?stripe=refresh`
      : `${appUrl}/provider-dashboard?tab=settings&stripe=refresh`;

    // If provider already has a Stripe account, check its status
    if (user.stripe_account_id) {
      const account = await stripe.accounts.retrieve(user.stripe_account_id);

      // If onboarding is complete, return dashboard link
      if (account.details_submitted) {
        await updateUserStripeAccount(user.id, user.stripe_account_id, true);
        const loginLink = await stripe.accounts.createLoginLink(user.stripe_account_id);
        return NextResponse.json({
          status: "connected",
          dashboardUrl: loginLink.url,
        });
      }

      // Otherwise, create a new onboarding link for the existing account
      const accountLink = await stripe.accountLinks.create({
        account: user.stripe_account_id,
        refresh_url: refreshUrl,
        return_url: `${appUrl}/api/stripe/connect?account_id=${user.stripe_account_id}`,
        type: "account_onboarding",
      });

      return NextResponse.json({
        status: "pending",
        onboardingUrl: accountLink.url,
      });
    }

    // Create a new Express Connect account
    const account = await stripe.accounts.create({
      type: "express",
      business_type: "individual",
      business_profile: {
        mcc: "7311",
        product_description: "Lead generation referrals",
        url: "https://www.womleads.com",
      },
      email: user.email,
      metadata: {
        woml_user_id: user.id,
      },
      capabilities: {
        transfers: { requested: true },
      },
    });

    // Save account ID to database
    await updateUserStripeAccount(user.id, account.id, false);

    // Create the onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: refreshUrl,
      return_url: `${appUrl}/api/stripe/connect?account_id=${account.id}`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      status: "created",
      onboardingUrl: accountLink.url,
    });
  } catch (error: any) {
    console.error("Stripe Connect error:", error);
    const message = error?.message || "Failed to set up Stripe Connect";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * GET /api/stripe/connect?account_id=acct_xxx
 * Return URL after Stripe onboarding — verify the account and redirect.
 */
export async function GET(request: NextRequest) {
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";

    const accountId = request.nextUrl.searchParams.get("account_id");
    if (!accountId) {
      return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=error`);
    }

    // Resolve the user — prefer session, fall back to DB lookup by stripe_account_id
    const session = await auth();
    let userId = session?.user?.id ?? null;

    if (!userId) {
      const dbUser = await getProviderByStripeAccountId(accountId);
      if (!dbUser) {
        console.error("[Stripe Connect] No user found for stripe_account_id:", accountId);
        return NextResponse.redirect(`${appUrl}/auth/login`);
      }
      userId = dbUser.id;
    }

    // Verify the account status with Stripe
    const account = await stripe.accounts.retrieve(accountId);

    // Mark stripe account in DB (preserve actual details_submitted value)
    await updateUserStripeAccount(userId, accountId, account.details_submitted === true);

    // If provider hasn't completed app onboarding, mark it complete now —
    // they've gone through the full Stripe flow, that's sufficient
    const onboardingState = await getProviderOnboardingState(userId);
    if (onboardingState && !onboardingState.complete) {
      const sql = getDb();
      await sql`UPDATE users SET onboarding_complete = TRUE, updated_at = NOW() WHERE id = ${userId}`;
      return NextResponse.redirect(`${appUrl}/provider-dashboard`);
    }

    return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=success`);
  } catch (error) {
    console.error("Stripe Connect callback error:", error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";
    return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=error`);
  }
}
