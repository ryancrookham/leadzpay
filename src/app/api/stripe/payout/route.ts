import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

function getStripe() {
  return new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
    apiVersion: "2026-01-28.clover",
  });
}

// Process instant payout to provider when lead is claimed
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { providerStripeAccountId, amount, leadId, providerId } = body;

    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json({
        success: true,
        simulated: true,
        message: `Payout of $${amount / 100} to provider simulated`,
        providerId,
        leadId,
      });
    }

    const stripe = getStripe();

    // Create a transfer to the provider's connected account
    const transfer = await stripe.transfers.create({
      amount, // Amount in cents
      currency: "usd",
      destination: providerStripeAccountId,
      metadata: {
        leadId,
        providerId,
        type: "lead_payout",
      },
    });

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      amount: transfer.amount,
    });
  } catch (error) {
    console.error("Payout error:", error);
    return NextResponse.json(
      { success: false, error: "Payout failed" },
      { status: 500 }
    );
  }
}
