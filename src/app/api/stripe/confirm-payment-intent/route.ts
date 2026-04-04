import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getLeadsByIds,
  getPlatformSettings,
  batchUpdateLeadStripeTransfer,
  createTransaction,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

/**
 * POST /api/stripe/confirm-payment-intent
 * Called after frontend completes 3D Secure authentication.
 * Verifies the PaymentIntent succeeded, then claims leads + creates transactions.
 *
 * Body: { paymentIntentId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can confirm payments" }, { status: 403 });
    }

    const body = await request.json();
    const { paymentIntentId } = body;

    if (!paymentIntentId || typeof paymentIntentId !== "string") {
      return NextResponse.json({ error: "paymentIntentId is required" }, { status: 400 });
    }

    // Retrieve the PaymentIntent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify it belongs to this buyer
    if (paymentIntent.metadata?.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Payment does not belong to you" }, { status: 403 });
    }

    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json({
        error: `Payment not completed. Status: ${paymentIntent.status}`,
        status: paymentIntent.status,
      }, { status: 400 });
    }

    const leadIdsStr = paymentIntent.metadata?.lead_ids;
    const providerId = paymentIntent.metadata?.provider_id;

    if (!leadIdsStr) {
      return NextResponse.json({ error: "No lead metadata on payment" }, { status: 400 });
    }

    const leadIds = leadIdsStr.split(",");
    const leads = await getLeadsByIds(leadIds);

    if (leads.length === 0) {
      return NextResponse.json({ error: "No leads found" }, { status: 404 });
    }

    const platformFees = await getPlatformSettings();

    // Atomic claim — only update leads not already completed
    const claimedIds = await batchUpdateLeadStripeTransfer(leadIds, paymentIntentId, "completed");
    if (claimedIds.length === 0) {
      // Already processed (e.g., by webhook) — that's fine
      return NextResponse.json({ success: true, alreadyProcessed: true });
    }

    const claimedSet = new Set(claimedIds);
    const claimedLeads = leads.filter(l => claimedSet.has(l.id));

    for (const lead of claimedLeads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);

      await createTransaction({
        type: "platform_fee",
        status: "completed",
        amount: breakdown.totalPlatformFee,
        fee_amount: 0,
        net_amount: breakdown.totalPlatformFee,
        from_account_id: session.user.id,
        to_account_id: null,
        lead_id: lead.id,
        connection_id: lead.connection_id || undefined,
        stripe_payment_id: paymentIntentId,
        description: `WOML platform fee (3DS confirmed)`,
      });

      await createTransaction({
        type: "lead_payout",
        status: "completed",
        amount: breakdown.providerNet,
        fee_amount: breakdown.providerFee,
        net_amount: breakdown.providerNet,
        from_account_id: null,
        to_account_id: lead.provider_id || providerId || null,
        lead_id: lead.id,
        connection_id: lead.connection_id || undefined,
        stripe_payment_id: paymentIntentId,
        description: `Provider payout via Stripe (3DS confirmed)`,
      });
    }

    console.log(`[confirm-payment-intent] ${claimedLeads.length} leads claimed for PI ${paymentIntentId}`);

    return NextResponse.json({ success: true, claimedCount: claimedLeads.length });
  } catch (error: any) {
    console.error("[confirm-payment-intent] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed to confirm payment" }, { status: 500 });
  }
}
