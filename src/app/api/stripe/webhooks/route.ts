import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import {
  getLeadsByIds,
  batchUpdateLeadStripeTransfer,
  batchUpdateLeadPayoutStatus,
  createTransaction,
  getPlatformSettings,
  hasWebhookBeenProcessed,
  markWebhookProcessed,
  updateTransactionStatusByLeadId,
  getProviderByStripeAccountId,
  getProcessingLeadsByProviderId,
  updateUserStripeAccount,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";
import Stripe from "stripe";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("stripe-signature");

    if (!signature) {
      return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
    }

    if (!STRIPE_WEBHOOK_SECRET) {
      console.error("STRIPE_WEBHOOK_SECRET is not configured");
      return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error("Webhook signature verification failed:", err);
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    // Idempotency check — skip if already processed
    if (await hasWebhookBeenProcessed(event.id)) {
      console.log(`Webhook event ${event.id} already processed, skipping`);
      return NextResponse.json({ received: true, skipped: "already processed" });
    }

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired":
        await handleCheckoutExpired(event.data.object as Stripe.Checkout.Session);
        break;

      case "account.updated":
        await handleAccountUpdated(event.data.object as Stripe.Account);
        break;

      case "payment_intent.payment_failed":
        await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case "transfer.reversed":
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    await markWebhookProcessed(event.id);

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const leadIdsStr = session.metadata?.lead_ids;
  const buyerId = session.metadata?.buyer_id;
  const providerId = session.metadata?.provider_id;

  if (!leadIdsStr || !buyerId) {
    // Setup-mode sessions (bank account connection) have no lead metadata
    if (session.mode === 'setup' && session.customer) {
      try {
        const { neon } = await import("@neondatabase/serverless");
        const sql = neon(process.env.DATABASE_URL!);
        await sql`UPDATE users SET buyer_stripe_setup_complete = true, updated_at = NOW() WHERE stripe_customer_id = ${session.customer as string}`;
        console.log(`Buyer Stripe setup complete for customer ${session.customer}`);
      } catch (err) {
        console.error('Failed to mark buyer_stripe_setup_complete:', err);
      }
    } else {
      console.log("Checkout session without lead metadata (likely setup mode):", session.id);
    }
    return;
  }

  const leadIds = leadIdsStr.split(",");
  const leads = await getLeadsByIds(leadIds);

  if (leads.length === 0) {
    console.error("No leads found for checkout session:", session.id);
    return;
  }

  // Skip leads already completed (verify-payment may have run before this webhook arrived)
  const unprocessedLeads = leads.filter(l => l.payout_status !== 'completed' && !l.stripe_transfer_id);
  if (unprocessedLeads.length === 0) {
    console.log(`[WEBHOOK] All leads already completed for checkout ${session.id} — skipping`);
    return;
  }

  const platformFees = await getPlatformSettings();
  const paymentIntentId = session.payment_intent as string;

  // With destination charges, Stripe already routed the money to the provider.
  // We just need to mark leads as completed and record the transactions.
  const leadIdList = unprocessedLeads.map(l => l.id);
  await batchUpdateLeadStripeTransfer(leadIdList, paymentIntentId, "completed");

  for (const lead of unprocessedLeads) {
    const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
    const pid = lead.provider_id || providerId || null;

    // Platform fee — WOML's cut
    await createTransaction({
      type: "platform_fee",
      status: "completed",
      amount: breakdown.totalPlatformFee,
      fee_amount: 0,
      net_amount: breakdown.totalPlatformFee,
      from_account_id: buyerId,
      to_account_id: null,
      lead_id: lead.id,
      connection_id: lead.connection_id || undefined,
      stripe_payment_id: paymentIntentId,
      description: `WOML platform fee (${(breakdown.totalPlatformFee / breakdown.ratePerLead * 100).toFixed(1)}% of $${breakdown.ratePerLead.toFixed(2)})`,
    });

    // Provider payout — recorded for earnings display
    await createTransaction({
      type: "lead_payout",
      status: "completed",
      amount: breakdown.providerNet,
      fee_amount: breakdown.providerFee,
      net_amount: breakdown.providerNet,
      from_account_id: null,
      to_account_id: pid,
      lead_id: lead.id,
      connection_id: lead.connection_id || undefined,
      stripe_payment_id: paymentIntentId,
      description: `Provider payout via Stripe (destination charge)`,
    });
  }

  console.log(`[WEBHOOK] checkout ${session.id} — ${unprocessedLeads.length} lead(s) marked paid, payment_intent ${paymentIntentId}`);
}

async function handleTransferReversed(transfer: Stripe.Transfer) {
  const leadIdsStr = transfer.metadata?.lead_ids;
  if (!leadIdsStr) {
    console.log("Transfer reversed without lead metadata:", transfer.id);
    return;
  }

  const leadIds = leadIdsStr.split(",");

  // Reset leads to pending
  await batchUpdateLeadPayoutStatus(leadIds, "pending");

  // Update transaction records to reflect the reversal
  for (const leadId of leadIds) {
    await updateTransactionStatusByLeadId(leadId, "lead_payout", "reversed");
  }

  console.log(`Transfer ${transfer.id} reversed — ${leadIds.length} leads reset to pending, transactions marked reversed`);
}

async function handleCheckoutExpired(session: Stripe.Checkout.Session) {
  const leadIdsStr = session.metadata?.lead_ids;
  if (!leadIdsStr) {
    // Setup-mode sessions have no lead metadata
    console.log("Checkout session expired (no lead metadata):", session.id);
    return;
  }

  console.log(`Checkout session ${session.id} expired — no action needed, leads remain pending`);
}

async function handleAccountUpdated(account: Stripe.Account) {
  // Only process if onboarding just completed
  if (!account.details_submitted) {
    return;
  }

  const provider = await getProviderByStripeAccountId(account.id);
  if (!provider) {
    console.log(`Account ${account.id} updated but no matching provider found`);
    return;
  }

  // Update provider's onboarding status in DB
  if (!provider.stripe_onboarding_complete) {
    await updateUserStripeAccount(provider.id, account.id, true);
    console.log(`Provider ${provider.id} completed Stripe onboarding`);
  }

  // Check for leads stuck in "processing" that can now be transferred
  const processingLeads = await getProcessingLeadsByProviderId(provider.id);
  if (processingLeads.length === 0) {
    return;
  }

  console.log(`Processing ${processingLeads.length} pending transfers for provider ${provider.id}`);

  const platformFees = await getPlatformSettings();

  // Calculate total transfer amount
  let transferCents = 0;
  for (const lead of processingLeads) {
    const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
    transferCents += Math.round(breakdown.providerNet * 100);
  }

  const leadIds = processingLeads.map(l => l.id);

  try {
    // Create the transfer now that provider is onboarded
    const transfer = await stripe.transfers.create({
      amount: transferCents,
      currency: "usd",
      destination: account.id,
      metadata: {
        lead_ids: leadIds.join(","),
        provider_id: provider.id,
        trigger: "account_updated_backfill",
      },
    });

    // Mark leads as completed
    await batchUpdateLeadStripeTransfer(leadIds, transfer.id, "completed");

    // Create transaction records for each lead
    for (const lead of processingLeads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);

      await createTransaction({
        type: "lead_payout",
        status: "completed",
        amount: breakdown.providerNet,
        fee_amount: breakdown.providerFee,
        net_amount: breakdown.providerNet,
        from_account_id: null,
        to_account_id: provider.id,
        lead_id: lead.id,
        connection_id: lead.connection_id || undefined,
        stripe_payment_id: transfer.id,
        description: `Provider payout via Stripe Connect (backfill after onboarding)`,
      });
    }

    console.log(`Backfill transfer ${transfer.id} created for provider ${provider.id}: $${(transferCents / 100).toFixed(2)}`);
  } catch (error) {
    console.error(`Backfill transfer failed for provider ${provider.id}:`, error);
    // Leave leads in processing state — admin will need to retry
  }
}

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const leadIdsStr = paymentIntent.metadata?.lead_ids;
  const buyerId = paymentIntent.metadata?.buyer_id;

  if (!leadIdsStr) {
    console.log("Payment failed without lead metadata:", paymentIntent.id);
    return;
  }

  const leadIds = leadIdsStr.split(",");

  console.log(`Payment ${paymentIntent.id} failed for ${leadIds.length} leads (buyer: ${buyerId})`);
  console.log(`Failure reason: ${paymentIntent.last_payment_error?.message || "unknown"}`);

  // Leads should still be in "pending" status since checkout wasn't completed
  // Log for monitoring but no state change needed
}
