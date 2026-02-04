import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { executeSql as sql, isDatabaseConfigured } from "@/lib/db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Create a Stripe Connect account for a provider
 * POST /api/stripe/connect
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    // Only providers can create Connect accounts
    if (session.user.role !== "provider") {
      return NextResponse.json(
        { error: "Only providers can connect Stripe accounts" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email } = body;

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({
        success: true,
        simulated: true,
        message: "Stripe not configured. In production, this would create a Connect account.",
      });
    }

    // Check if user already has a Stripe account
    let stripeAccountId = session.user.stripeAccountId;

    if (!stripeAccountId) {
      // Create a new Connect Express account
      const account = await stripe.accounts.create({
        type: "express",
        email: email || session.user.email,
        metadata: {
          providerId: session.user.id,
          womlUser: "true",
        },
        capabilities: {
          transfers: { requested: true },
        },
        business_type: "individual",
        settings: {
          payouts: {
            schedule: {
              interval: "daily",
            },
          },
        },
      });

      stripeAccountId = account.id;

      // Save to database
      if (isDatabaseConfigured()) {
        await sql`
          UPDATE users
          SET stripe_account_id = ${stripeAccountId}, stripe_onboarding_complete = false
          WHERE id = ${session.user.id}
        `;
      }
    }

    // Create account link for onboarding
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://leadzpay.vercel.app";
    const accountLink = await stripe.accountLinks.create({
      account: stripeAccountId,
      refresh_url: `${appUrl}/provider-dashboard?stripe=refresh`,
      return_url: `${appUrl}/provider-dashboard?stripe=success`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      success: true,
      accountId: stripeAccountId,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe Connect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create Stripe account" },
      { status: 500 }
    );
  }
}

/**
 * Get Stripe Connect account status
 * GET /api/stripe/connect
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.user.role !== "provider") {
      return NextResponse.json(
        { error: "Only providers have Connect accounts" },
        { status: 403 }
      );
    }

    const stripe = getStripe();
    if (!stripe || !session.user.stripeAccountId) {
      return NextResponse.json({
        connected: false,
        onboardingComplete: false,
        stripeConfigured: !!stripe,
      });
    }

    // Get account details from Stripe
    const account = await stripe.accounts.retrieve(session.user.stripeAccountId);

    return NextResponse.json({
      connected: true,
      accountId: session.user.stripeAccountId,
      onboardingComplete: account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    });
  } catch (error) {
    console.error("Get Connect status error:", error);
    return NextResponse.json(
      { error: "Failed to get account status" },
      { status: 500 }
    );
  }
}
