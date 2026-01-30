import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
    apiVersion: "2026-01-28.clover",
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { amount, providerId, leadId } = body;

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.log("Stripe not configured - simulating payment");
      return NextResponse.json({
        success: true,
        simulated: true,
        message: `Payment of $${amount / 100} to provider would be processed`,
        providerId,
        leadId,
      });
    }

    const stripe = getStripe();

    // Create a PaymentIntent for the lead payout
    const paymentIntent = await stripe.paymentIntents.create({
      amount, // Amount in cents
      currency: "usd",
      metadata: {
        providerId,
        leadId,
        type: "lead_payout",
      },
      // For automatic payouts to connected accounts, you'd use:
      // transfer_data: { destination: providerStripeAccountId }
    });

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    console.error("Stripe error:", error);
    return NextResponse.json(
      { success: false, error: "Payment failed" },
      { status: 500 }
    );
  }
}
