import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { executeSql as sql, isDatabaseConfigured, getUserById, createTransaction } from "@/lib/db";
import { createPaymentSchema, validateInput } from "@/lib/validation";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Create a payment for a lead payout
 * This is called by the buyer when they claim a lead
 */
export async function POST(request: NextRequest) {
  try {
    // Validate session - only buyers can create payments
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.user.role !== "buyer") {
      return NextResponse.json(
        { error: "Only buyers can create payments" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate input
    const validation = validateInput(createPaymentSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", details: validation.errors },
        { status: 400 }
      );
    }

    const { amount, providerId, leadId, description } = validation.data;

    const stripe = getStripe();

    // If Stripe not configured, simulate
    if (!stripe) {
      console.log("Stripe not configured - simulating payment");
      return NextResponse.json({
        success: true,
        simulated: true,
        message: `Payment of $${amount} to provider would be processed`,
        providerId,
        leadId,
      });
    }

    // Get provider's Stripe account ID from database
    let providerStripeAccountId: string | null = null;

    if (isDatabaseConfigured()) {
      const provider = await getUserById(providerId);
      if (provider?.stripe_account_id && provider?.stripe_onboarding_complete) {
        providerStripeAccountId = provider.stripe_account_id;
      }
    }

    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    // No platform fee - provider receives 100% of payment
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: "usd",
      metadata: {
        providerId,
        leadId,
        buyerId: session.user.id,
        type: "lead_payout",
        description: description || `Lead payout for ${leadId}`,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // If provider has a connected Stripe account, set up transfer
    if (providerStripeAccountId) {
      paymentIntentParams.transfer_data = {
        destination: providerStripeAccountId,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Record pending transaction in database
    if (isDatabaseConfigured()) {
      await createTransaction({
        type: "lead_payout",
        amount: amount,
        fee_amount: 0,
        net_amount: amount,
        from_account_id: session.user.id,
        to_account_id: providerId,
        lead_id: leadId,
        stripe_payment_id: paymentIntent.id,
        description: description || `Lead payout for ${leadId}`,
      });
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amount,
      platformFee: 0,
      providerPayout: amount,
      hasConnectedAccount: !!providerStripeAccountId,
    });
  } catch (error) {
    console.error("Stripe payment error:", error);
    return NextResponse.json(
      { success: false, error: "Payment creation failed" },
      { status: 500 }
    );
  }
}
