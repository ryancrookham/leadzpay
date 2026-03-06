import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import {
  getLeadsByIds,
  getProvidersByIds,
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

  // Get platform fee settings
  const platformFees = await getPlatformSettings();

  // Group leads by provider
  const leadsByProvider = new Map<string, typeof leads>();
  for (const lead of leads) {
    const existing = leadsByProvider.get(lead.provider_id) || [];
    existing.push(lead);
    leadsByProvider.set(lead.provider_id, existing);
  }

  // Get all provider details
  const providerIds = Array.from(leadsByProvider.keys());
  const providers = await getProvidersByIds(providerIds);
  const providerMap = new Map(providers.map(p => [p.id, p]));

  let failedProviders = 0;

  // Process each provider group independently
  for (const [providerId, providerLeads] of leadsByProvider) {
    const provider = providerMap.get(providerId);
    const providerLeadIds = providerLeads.map(l => l.id);

    // Calculate total transfer amount for this provider
    let transferCents = 0;
    for (const lead of providerLeads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
      transferCents += Math.round(breakdown.providerNet * 100);
    }

    // Mark this provider's leads as processing
    await batchUpdateLeadPayoutStatus(providerLeadIds, "processing");

    if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
      // Provider not connected to Stripe — leave as processing until they complete onboarding
      console.log(`Provider ${providerId} not on Stripe Connect — leads stay processing`);

      // Still create platform_fee transactions
      for (const lead of providerLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
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
          stripe_payment_id: session.payment_intent as string || undefined,
          description: `Platform fee for lead (buyer paid via Stripe)`,
        });
      }
      continue;
    }

    try {
      // Create Stripe Transfer to provider's Connect account
      const transfer = await stripe.transfers.create({
        amount: transferCents,
        currency: "usd",
        destination: provider.stripe_account_id,
        transfer_group: session.id, // Links multi-provider payments for reconciliation
        metadata: {
          lead_ids: providerLeadIds.join(","),
          provider_id: providerId,
          buyer_id: buyerId,
        },
      });

      // Mark leads as completed with transfer ID
      await batchUpdateLeadStripeTransfer(providerLeadIds, transfer.id, "completed");

      // Create transaction records
      for (const lead of providerLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);

        // Platform fee transaction
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
          stripe_payment_id: session.payment_intent as string || undefined,
          description: `Platform fee for lead (Stripe)`,
        });

        // Provider payout transaction
        await createTransaction({
          type: "lead_payout",
          status: "completed",
          amount: breakdown.providerNet,
          fee_amount: breakdown.providerFee,
          net_amount: breakdown.providerNet,
          from_account_id: null,
          to_account_id: providerId,
          lead_id: lead.id,
          connection_id: lead.connection_id || undefined,
          stripe_payment_id: transfer.id,
          description: `Provider payout via Stripe Connect`,
        });
      }

      console.log(`Transfer ${transfer.id} created for provider ${providerId}: $${(transferCents / 100).toFixed(2)}`);
    } catch (error) {
      console.error(`Transfer failed for provider ${providerId}:`, error);
      failedProviders++;

      // Mark this provider's leads as failed
      await batchUpdateLeadStripeTransfer(providerLeadIds, "", "failed");

      // Create a transfer_failed transaction record for each lead so the ledger reflects what happened
      for (const lead of providerLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        await createTransaction({
          type: "lead_payout",
          status: "failed",
          amount: breakdown.providerNet,
          fee_amount: breakdown.providerFee,
          net_amount: 0,
          from_account_id: null,
          to_account_id: providerId,
          lead_id: lead.id,
          connection_id: lead.connection_id || undefined,
          description: `Provider payout failed — transfer to Stripe Connect rejected`,
        });

        // Platform fee still recorded (business was charged)
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
          stripe_payment_id: session.payment_intent as string || undefined,
          description: `Platform fee for lead (transfer to provider failed)`,
        });
      }
    }
  }

  if (failedProviders > 0) {
    console.warn(`[WEBHOOK] ${failedProviders} provider transfer(s) failed for checkout ${session.id} — requires admin attention`);
  }
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
