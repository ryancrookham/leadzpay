import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { executeSql as sql, isDatabaseConfigured, createTransaction } from "@/lib/db";

function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Handle Stripe webhook events
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
      console.warn("STRIPE_WEBHOOK_SECRET not configured - skipping signature verification");
      event = JSON.parse(body) as Stripe.Event;
    }

    console.log(`Received Stripe webhook: ${event.type}`);

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

      case "payout.paid":
        console.log(`Payout paid: ${(event.data.object as Stripe.Payout).id}`);
        break;

      case "payout.failed":
        console.log(`Payout failed: ${(event.data.object as Stripe.Payout).id}`);
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

async function handleAccountUpdated(account: Stripe.Account) {
  console.log(`Account updated: ${account.id}`);

  const isOnboardingComplete =
    account.charges_enabled &&
    account.payouts_enabled &&
    account.details_submitted;

  if (!isDatabaseConfigured()) {
    console.log("Database not configured - skipping update");
    return;
  }

  try {
    await sql`
      UPDATE users
      SET stripe_onboarding_complete = ${isOnboardingComplete}
      WHERE stripe_account_id = ${account.id}
    `;
    console.log(`Updated onboarding status for ${account.id}: ${isOnboardingComplete}`);
  } catch (error) {
    console.error("Error updating account:", error);
  }
}

async function handlePaymentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment succeeded: ${paymentIntent.id}`);

  const { leadId, providerId, type } = paymentIntent.metadata || {};

  if (!isDatabaseConfigured()) {
    console.log("Database not configured - skipping update");
    return;
  }

  try {
    if (type === "lead_payout" && leadId) {
      await sql`
        UPDATE leads SET payout_status = 'processing' WHERE id = ${leadId}
      `;

      await createTransaction({
        type: "lead_payout",
        amount: paymentIntent.amount / 100,
        fee_amount: 0,
        net_amount: paymentIntent.amount / 100,
        to_account_id: providerId,
        lead_id: leadId,
        stripe_payment_id: paymentIntent.id,
        description: `Lead payout for ${leadId}`,
      });

      console.log(`Recorded payment transaction for lead ${leadId}`);
    }
  } catch (error) {
    console.error("Error handling payment success:", error);
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  console.log(`Payment failed: ${paymentIntent.id}`);

  const { leadId } = paymentIntent.metadata || {};

  if (!isDatabaseConfigured() || !leadId) {
    return;
  }

  try {
    await sql`
      UPDATE leads SET payout_status = 'failed' WHERE id = ${leadId}
    `;
  } catch (error) {
    console.error("Error handling payment failure:", error);
  }
}

async function handleTransferCreated(transfer: Stripe.Transfer) {
  console.log(`Transfer created: ${transfer.id}`);

  const { leadId } = transfer.metadata || {};

  if (!isDatabaseConfigured()) {
    return;
  }

  try {
    if (leadId) {
      await sql`
        UPDATE leads
        SET stripe_transfer_id = ${transfer.id},
            payout_status = 'completed',
            payout_completed_at = NOW()
        WHERE id = ${leadId}
      `;
    }
    console.log(`Transfer ${transfer.id} completed for lead ${leadId}`);
  } catch (error) {
    console.error("Error handling transfer created:", error);
  }
}
