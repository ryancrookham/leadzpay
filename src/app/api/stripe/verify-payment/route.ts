import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe"; // still used to retrieve checkout session
import {
  getLeadsByIds,
  batchUpdateLeadStripeTransfer,
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

    // If all leads are already completed (webhook ran first), nothing to do
    const stillPending = leads.filter((l) => l.payout_status !== "completed" && !l.stripe_transfer_id);
    if (stillPending.length === 0) {
      return NextResponse.json({
        status: "already_processed",
        message: "Leads already updated (webhook likely processed this)",
      });
    }

    // With destination charges, Stripe already routed the money to the provider.
    // We just record the transactions and mark leads complete.
    const platformFees = await getPlatformSettings();
    const paymentIntentId = checkoutSession.payment_intent as string;
    const stillPendingIds = stillPending.map((l) => l.id);

    await batchUpdateLeadStripeTransfer(stillPendingIds, paymentIntentId, "completed");

    for (const lead of stillPending) {
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
        stripe_payment_id: paymentIntentId,
        description: `WOML platform fee (${(breakdown.totalPlatformFee / breakdown.ratePerLead * 100).toFixed(1)}%)`,
      });

      await createTransaction({
        type: "lead_payout",
        status: "completed",
        amount: breakdown.providerNet,
        fee_amount: breakdown.providerFee,
        net_amount: breakdown.providerNet,
        from_account_id: null,
        to_account_id: lead.provider_id,
        lead_id: lead.id,
        connection_id: lead.connection_id || undefined,
        stripe_payment_id: paymentIntentId,
        description: `Provider payout via Stripe (destination charge)`,
      });
    }

    console.log(`[VERIFY-PAYMENT] ${stillPending.length} lead(s) marked paid for checkout ${checkoutSession.id}`);

    return NextResponse.json({
      status: "processed",
      message: "Payment verified and leads updated",
      leadsUpdated: stillPending.length,
    });
  } catch (error) {
    console.error("[VERIFY-PAYMENT] error:", error);
    return NextResponse.json({ error: "Verification failed" }, { status: 500 });
  }
}
