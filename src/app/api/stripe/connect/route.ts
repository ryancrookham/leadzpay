import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getUserById, updateUserStripeAccount } from "@/lib/db";

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
        refresh_url: `${appUrl}/provider-dashboard?tab=settings&stripe=refresh`,
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
      refresh_url: `${appUrl}/provider-dashboard?tab=settings&stripe=refresh`,
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
    const session = await auth();
    if (!session?.user?.id) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";
      return NextResponse.redirect(`${appUrl}/auth/login`);
    }

    const accountId = request.nextUrl.searchParams.get("account_id");
    if (!accountId) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";
      return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=error`);
    }

    // Verify the account status
    const account = await stripe.accounts.retrieve(accountId);
    const onboardingComplete = account.details_submitted === true;

    // Update database
    await updateUserStripeAccount(session.user.id, accountId, onboardingComplete);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";
    const status = onboardingComplete ? "success" : "pending";
    return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=${status}`);
  } catch (error) {
    console.error("Stripe Connect callback error:", error);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";
    return NextResponse.redirect(`${appUrl}/provider-dashboard?tab=settings&stripe=error`);
  }
}
