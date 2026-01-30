import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
    apiVersion: "2026-01-28.clover",
  });
}

// Create a Stripe Connect account for a provider
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, providerId } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        success: true,
        simulated: true,
        message: "Stripe Connect account would be created",
        providerId,
      });
    }

    const stripe = getStripe();

    // Create a Connect Express account
    const account = await stripe.accounts.create({
      type: "express",
      email,
      metadata: {
        providerId,
      },
      capabilities: {
        transfers: { requested: true },
      },
    });

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?stripe=refresh`,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?stripe=success`,
      type: "account_onboarding",
    });

    return NextResponse.json({
      success: true,
      accountId: account.id,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    console.error("Stripe Connect error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create account" },
      { status: 500 }
    );
  }
}
