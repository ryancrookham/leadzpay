import { NextRequest, NextResponse } from "next/server";
import { stripe, STRIPE_WEBHOOK_SECRET } from "@/lib/stripe";
import {
  getLeadsByIds,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
  batchUpdateLeadPayoutStatus,
  createTransaction,
  getPlatformSettings,
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

    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case "transfer.reversed":
        await handleTransferReversed(event.data.object as Stripe.Transfer);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

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
    console.error("Checkout session missing metadata:", session.id);
    return;
  }

  const leadIds = leadIdsStr.split(",");
  const leads = await getLeadsByIds(leadIds);

  if (leads.length === 0) {
    console.error("No leads found for checkout session:", session.id);
    return;
  }

  // Mark all leads as processing
  await batchUpdateLeadPayoutStatus(leadIds, "processing");

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

  // Create transfers for each provider
  for (const [providerId, providerLeads] of leadsByProvider) {
    const provider = providerMap.get(providerId);

    // Calculate total transfer amount for this provider (rate per lead minus provider fee)
    let transferCents = 0;
    for (const lead of providerLeads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
      transferCents += Math.round(breakdown.providerNet * 100);
    }

    const providerLeadIds = providerLeads.map(l => l.id);

    if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
      // Provider not connected to Stripe — leave as processing (manual payout via Venmo)
      console.log(`Provider ${providerId} not on Stripe Connect — leads stay processing for manual payout`);

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
      // Mark leads as failed
      await batchUpdateLeadStripeTransfer(providerLeadIds, "", "failed");
    }
  }
}

async function handleTransferReversed(transfer: Stripe.Transfer) {
  const leadIdsStr = transfer.metadata?.lead_ids;
  if (!leadIdsStr) {
    console.log("Transfer reversed without lead metadata:", transfer.id);
    return;
  }

  const leadIds = leadIdsStr.split(",");
  // Mark affected leads back to pending
  await batchUpdateLeadPayoutStatus(leadIds, "pending");
  console.log(`Transfer ${transfer.id} reversed — ${leadIds.length} leads reset to pending`);
}
