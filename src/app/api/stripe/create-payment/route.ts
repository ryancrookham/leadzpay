import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { executeSql as sql, isDatabaseConfigured, getUserById, createTransaction } from "@/lib/db";
import { createPaymentSchema, validateInput } from "@/lib/validation";
import { PLATFORM_FEE_TOTAL, PLATFORM_FEE_PROVIDER, calculateFeeBreakdown } from "@/lib/platform-fees";

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

    // Calculate fees
    const fees = calculateFeeBreakdown(amount);
    const buyerTotalCents = Math.round(fees.buyerTotal * 100);
    const platformFeeCents = Math.round(PLATFORM_FEE_TOTAL * 100);

    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: buyerTotalCents,
      currency: "usd",
      metadata: {
        providerId,
        leadId,
        buyerId: session.user.id,
        type: "lead_payout",
        ratePerLead: String(amount),
        platformFee: String(PLATFORM_FEE_TOTAL),
        providerNet: String(fees.providerNet),
        description: description || `Lead payout for ${leadId}`,
      },
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // Platform takes $2 fee, rest goes to provider's connected Stripe account
    if (providerStripeAccountId) {
      paymentIntentParams.transfer_data = {
        destination: providerStripeAccountId,
      };
      paymentIntentParams.application_fee_amount = platformFeeCents;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Record transactions in database
    if (isDatabaseConfigured()) {
      // Lead payout transaction (provider earning)
      await createTransaction({
        type: "lead_payout",
        status: "pending",
        amount: amount,
        fee_amount: PLATFORM_FEE_PROVIDER,
        net_amount: fees.providerNet,
        from_account_id: session.user.id,
        to_account_id: providerId,
        lead_id: leadId,
        stripe_payment_id: paymentIntent.id,
        description: description || `Lead payout for ${leadId}`,
      });

      // Platform fee transaction
      await createTransaction({
        type: "platform_fee",
        status: "completed",
        amount: PLATFORM_FEE_TOTAL,
        fee_amount: 0,
        net_amount: PLATFORM_FEE_TOTAL,
        from_account_id: session.user.id,
        to_account_id: null,
        lead_id: leadId,
        description: `Platform fee for lead ${leadId}`,
      });
    }

    return NextResponse.json({
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: fees.buyerTotal,
      platformFee: PLATFORM_FEE_TOTAL,
      providerPayout: fees.providerNet,
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
