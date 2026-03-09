import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getLeadsByIds,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
  batchUpdateLeadPayoutStatus,
  createTransaction,
  getPlatformSettings,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

/**
 * POST /api/stripe/verify-payment
 * Called by the business dashboard when the buyer returns from Stripe success URL.
 * Retrieves the Checkout Session from Stripe, confirms it's paid, then processes
 * lead status updates and provider transfers — acting as a synchronous redundancy
 * layer in case the webhook is delayed or misconfigured.
 *
 * Body: { sessionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can verify payments" }, { status: 403 });
    }

    const body = await request.json();
    const { sessionId } = body as { sessionId?: string };

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    // Fetch the Stripe Checkout Session to confirm payment
    const checkoutSession = await stripe.checkout.sessions.retrieve(sessionId);

    if (checkoutSession.payment_status !== "paid") {
      return NextResponse.json({
        status: "not_paid",
        message: "Payment has not completed yet",
      });
    }

    const leadIdsStr = checkoutSession.metadata?.lead_ids;
    const buyerId = checkoutSession.metadata?.buyer_id;

    if (!leadIdsStr || !buyerId) {
      return NextResponse.json({ error: "Session metadata missing" }, { status: 400 });
    }

    // Verify the buyer owns this session
    if (buyerId !== session.user.id) {
      return NextResponse.json({ error: "Not authorized for this session" }, { status: 403 });
    }

    const leadIds = leadIdsStr.split(",");
    const leads = await getLeadsByIds(leadIds);

    if (leads.length === 0) {
      return NextResponse.json({ error: "No leads found" }, { status: 404 });
    }

    // If leads are already completed or processing, nothing to do
    const stillPending = leads.filter((l) => l.payout_status === "pending");
    if (stillPending.length === 0) {
      return NextResponse.json({
        status: "already_processed",
        message: "Leads already updated (webhook likely processed this)",
      });
    }

    // Payment confirmed — process the same logic as the webhook
    const platformFees = await getPlatformSettings();

    // Group leads by provider
    const leadsByProvider = new Map<string, typeof leads>();
    for (const lead of stillPending) {
      const existing = leadsByProvider.get(lead.provider_id) || [];
      existing.push(lead);
      leadsByProvider.set(lead.provider_id, existing);
    }

    const providerIds = Array.from(leadsByProvider.keys());
    const providers = await getProvidersByIds(providerIds);
    const providerMap = new Map(providers.map((p) => [p.id, p]));

    let totalTransferred = 0;

    for (const [providerId, providerLeads] of leadsByProvider) {
      const provider = providerMap.get(providerId);
      const providerLeadIds = providerLeads.map((l) => l.id);

      let transferCents = 0;
      for (const lead of providerLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        transferCents += Math.round(breakdown.providerNet * 100);
      }

      // Mark as processing first
      await batchUpdateLeadPayoutStatus(providerLeadIds, "processing");

      if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
        // Provider not on Stripe Connect yet — create platform_fee records and leave as processing
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
            stripe_payment_id: checkoutSession.payment_intent as string || undefined,
            description: `Platform fee for lead (buyer paid via Stripe — verify-payment)`,
          });
        }
        continue;
      }

      try {
        const transfer = await stripe.transfers.create({
          amount: transferCents,
          currency: "usd",
          destination: provider.stripe_account_id,
          transfer_group: checkoutSession.id,
          metadata: {
            lead_ids: providerLeadIds.join(","),
            provider_id: providerId,
            buyer_id: buyerId,
            trigger: "verify_payment",
          },
        });

        await batchUpdateLeadStripeTransfer(providerLeadIds, transfer.id, "completed");

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
            stripe_payment_id: checkoutSession.payment_intent as string || undefined,
            description: `Platform fee for lead (verify-payment)`,
          });

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
            description: `Provider payout via Stripe Connect (verify-payment)`,
          });
        }

        totalTransferred += transferCents;
        console.log(`[VERIFY-PAYMENT] Transfer ${transfer.id} → provider ${providerId}: $${(transferCents / 100).toFixed(2)}`);
      } catch (transferErr: any) {
        console.error(`[VERIFY-PAYMENT] Transfer failed for provider ${providerId}:`, transferErr);
        await batchUpdateLeadStripeTransfer(providerLeadIds, "", "failed");
      }
    }

    return NextResponse.json({
      status: "processed",
      message: "Payment verified and leads updated",
      totalTransferredCents: totalTransferred,
    });
  } catch (error) {
    console.error("[VERIFY-PAYMENT] error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
