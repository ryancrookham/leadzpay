import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { validateSession } from "@/lib/server/session";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db";
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
    const session = await validateSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.role !== "buyer") {
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

    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();
      const { data: provider } = await supabase
        .from("users")
        .select("stripe_account_id, stripe_onboarding_complete")
        .eq("id", providerId)
        .single();

      if (provider?.stripe_account_id && provider?.stripe_onboarding_complete) {
        providerStripeAccountId = provider.stripe_account_id;
      }
    }

    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    // No platform fee - provider receives 100% of payment
    // Create PaymentIntent with or without transfer
    const paymentIntentParams: Stripe.PaymentIntentCreateParams = {
      amount: amountInCents,
      currency: "usd",
      metadata: {
        providerId,
        leadId,
        buyerId: session.userId,
        type: "lead_payout",
        description: description || `Lead payout for ${leadId}`,
      },
      // Automatic payment methods for flexibility
      automatic_payment_methods: {
        enabled: true,
      },
    };

    // If provider has a connected Stripe account, set up transfer (full amount, no fee)
    if (providerStripeAccountId) {
      paymentIntentParams.transfer_data = {
        destination: providerStripeAccountId,
      };
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentParams);

    // Record pending transaction in database
    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();
      await supabase.from("transactions").insert({
        type: "lead_payout",
        status: "pending",
        amount: amount,
        fee_amount: 0,
        net_amount: amount,
        from_account_id: session.userId,
        to_account_id: providerId,
        lead_id: leadId,
        stripe_payment_id: paymentIntent.id,
        description: description || `Lead payout for ${leadId}`,
        metadata: {
          has_connected_account: !!providerStripeAccountId,
        },
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
