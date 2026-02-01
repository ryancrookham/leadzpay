import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db";

// Lazy Stripe initialization to avoid build-time errors
function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Handle Stripe webhook events
 *
 * Events handled:
 * - account.updated: Stripe Connect account status changes
 * - payment_intent.succeeded: Payment completed
 * - payment_intent.payment_failed: Payment failed
 * - transfer.created: Payout transfer created
 * - transfer.reversed: Payout transfer reversed
 * - payout.paid: Payout to provider bank complete
 * - payout.failed: Payout to provider bank failed
 */
export async function POST(request: NextRequest) {
  try {
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe not configured" },
        { status: 500 }
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json(
        { error: "Missing stripe-signature header" },
        { status: 400 }
      );
    }

    // Verify webhook signature
    let event: Stripe.Event;

    if (webhookSecret) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Webhook signature verification failed:", err);
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 400 }
        );
      }
    } else {
      // In development without webhook secret, parse directly
      console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`Received Stripe webhook: ${event.type}`);

    // Handle the event
    switch (event.type) {
      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case "payment_intent.succeeded":
        await handlePaymentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "transfer.created":
        await handleTransferCreated(event.data.object as Stripe.Transfer);
        break;

      case "transfer.reversed":
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;

      case "payout.paid":
        await handlePayoutPaid(event.data.object as Stripe.Payout);
        break;

      case "payout.failed":
        await handlePayoutFailed(event.data.object as Stripe.Payout);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json(
      { error: "Webhook handler failed" },
      { status: 500 }
    );
  }
}

/**
 * Handle Stripe Connect account updates
 */
async function handleAccountUpdated(account: Stripe.Account) {
  console.log(`Account updated: ${account.id}`);

  const isOnboardingComplete =
    account.charges_enabled &&
    account.payouts_enabled &&
    account.details_submitted;

  if (!isSupabaseServerConfigured()) {
    console.log("Supabase not configured - skipping DB update");
    return;
  }

  try {
    const supabase = getSupabaseServerClient();

    // Update user's Stripe onboarding status
    const { error } = await supabase
      .from("users")
      .update({
        stripe_onboarding_complete: isOnboardingComplete,
      })
      .eq("stripe_account_id", account.id);

    if (error) {
      console.error("Failed to update user Stripe status:", error);
    } else {
      console.log(`Updated onboarding status for ${account.id}: ${isOnboardingComplete}`);
    }
  } catch (error) {
    console.error("Error updating account:", error);
  }
}

/**
 * Handle successful payment
 */
async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment succeeded: ${paymentIntent.id}`);

  const { leadId, providerId, type } = paymentIntent.metadata || {};

  if (!isSupabaseServerConfigured()) {
    console.log("Supabase not configured - skipping DB update");
    return;
  }

  try {
    const supabase = getSupabaseServerClient();

    // If this is a lead payout, update the lead and create transaction
    if (type === "lead_payout" && leadId) {
      // Update lead payout status
      await supabase
        .from("leads")
        .update({
          payout_status: "processing", // Will be 'completed' after transfer
        })
        .eq("id", leadId);

      // Record transaction
      await supabase.from("transactions").insert({
        type: "lead_payout",
        status: "pending", // Pending until transfer completes
        amount: paymentIntent.amount / 100, // Convert from cents
        fee_amount: 0, // Calculate actual fees
        net_amount: paymentIntent.amount / 100,
        to_account_id: providerId,
        lead_id: leadId,
        stripe_payment_id: paymentIntent.id,
        description: `Lead payout for ${leadId}`,
        metadata: paymentIntent.metadata,
      });

      console.log(`Recorded payment transaction for lead ${leadId}`);
    }
  } catch (error) {
    console.error("Error handling payment success:", error);
  }
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);

  const { leadId } = paymentIntent.metadata || {};

  if (!isSupabaseServerConfigured() || !leadId) {
    return;
  }

  try {
    const supabase = getSupabaseServerClient();

    // Update lead payout status
    await supabase
      .from("leads")
      .update({
        payout_status: "failed",
      })
      .eq("id", leadId);

    // Record failed transaction
    await supabase.from("transactions").insert({
      type: "lead_payout",
      status: "failed",
      amount: paymentIntent.amount / 100,
      fee_amount: 0,
      net_amount: 0,
      lead_id: leadId,
      stripe_payment_id: paymentIntent.id,
      description: `Failed payout for lead ${leadId}`,
      metadata: {
        ...paymentIntent.metadata,
        failure_message: paymentIntent.last_payment_error?.message,
      },
    });
  } catch (error) {
    console.error("Error handling payment failure:", error);
  }
}

/**
 * Handle transfer created (payout to connected account)
 */
async function handleTransferCreated(transfer: Stripe.Transfer) {
  console.log(`Transfer created: ${transfer.id}`);

  const { leadId, transactionId } = transfer.metadata || {};

  if (!isSupabaseServerConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseServerClient();

    // Update lead with transfer ID
    if (leadId) {
      await supabase
        .from("leads")
        .update({
          stripe_transfer_id: transfer.id,
          payout_status: "completed",
          payout_completed_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }

    // Update transaction status
    if (transactionId) {
      await supabase
        .from("transactions")
        .update({
          status: "completed",
          stripe_transfer_id: transfer.id,
          completed_at: new Date().toISOString(),
        })
        .eq("id", transactionId);
    }

    console.log(`Transfer ${transfer.id} completed for lead ${leadId}`);
  } catch (error) {
    console.error("Error handling transfer created:", error);
  }
}

/**
 * Handle reversed transfer
 */
async function handleTransferReversed(transfer: Stripe.Transfer) {
  console.log(`Transfer reversed: ${transfer.id}`);

  const { leadId, transactionId } = transfer.metadata || {};

  if (!isSupabaseServerConfigured()) {
    return;
  }

  try {
    const supabase = getSupabaseServerClient();

    if (leadId) {
      await supabase
        .from("leads")
        .update({
          payout_status: "failed",
        })
        .eq("id", leadId);
    }

    if (transactionId) {
      await supabase
        .from("transactions")
        .update({
          status: "failed",
          stripe_transfer_id: transfer.id,
        })
        .eq("id", transactionId);
    }
  } catch (error) {
    console.error("Error handling transfer failure:", error);
  }
}

/**
 * Handle payout paid (money arrived in provider's bank)
 */
async function handlePayoutPaid(payout: Stripe.Payout) {
  console.log(`Payout paid: ${payout.id} - $${payout.amount / 100}`);

  // This is triggered when funds arrive in the connected account's bank
  // We can use this to send notifications to providers

  // For now, just log it
  console.log(`Provider received payout of $${payout.amount / 100}`);
}

/**
 * Handle failed payout
 */
async function handlePayoutFailed(payout: Stripe.Payout) {
  console.log(`Payout failed: ${payout.id}`);
  console.error(`Payout failure reason: ${payout.failure_message}`);

  // Could trigger notification to provider about failed payout
}

