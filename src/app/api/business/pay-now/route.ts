import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getAutoPaySettings,
  autoApproveLeads,
  getApprovedLeadsByBuyerId,
  updateNextAutoPayDate,
} from "@/lib/db";
import { processBatchPayment } from "@/lib/payments";

/**
 * POST /api/business/pay-now
 * Immediately processes all approved leads for the current business.
 * Used by the "Pay Now" button when schedule is set to Instant.
 */
export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can trigger payments" }, { status: 403 });
    }

    const buyerId = session.user.id;

    // manualBatch=true: business manually pays all pending leads right now (any payout mode).
    // Without it: requires auto_pay_enabled (instant/scheduled modes).
    let body: { manualBatch?: boolean } = {};
    try { body = await request.json(); } catch { /* empty body ok */ }
    const isManualBatch = body?.manualBatch === true;

    const settings = await getAutoPaySettings(buyerId);

    if (!isManualBatch && !settings.auto_pay_enabled) {
      return NextResponse.json({ error: "Auto-pay is not enabled" }, { status: 400 });
    }

    // Manual batch: approve everything pending right now (0-day review override).
    // Auto modes: approve leads past their configured review window.
    const reviewWindow = isManualBatch ? 0 : settings.review_window_days;
    const autoApproved = await autoApproveLeads(buyerId, reviewWindow);

    // Get all approved leads waiting for payment
    const approvedLeads = await getApprovedLeadsByBuyerId(buyerId);

    if (approvedLeads.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No approved leads to pay out.",
        autoApproved: autoApproved.length,
        succeeded: 0,
        failed: 0,
      });
    }

    // Process payment via Stripe
    const result = await processBatchPayment(buyerId, approvedLeads);

    if (result.needsSetup) {
      return NextResponse.json({
        error: "No payment method configured. Please connect a payment method in Settings.",
      }, { status: 400 });
    }

    const succeeded = result.results.filter(r => r.status === "succeeded").length;
    const failed = result.results.filter(r => r.status === "failed").length;
    const skipped3ds = result.results.filter(r => r.status === "requires_action").length;

    // Reset next_auto_pay_date to now so it stays ready for the next instant run
    await updateNextAutoPayDate(buyerId, new Date());

    return NextResponse.json({
      success: true,
      autoApproved: autoApproved.length,
      approvedTotal: approvedLeads.length,
      succeeded,
      failed,
      skipped3ds,
      message: `Paid ${succeeded} lead${succeeded !== 1 ? "s" : ""}${failed > 0 ? `, ${failed} failed` : ""}${skipped3ds > 0 ? `, ${skipped3ds} require 3DS verification` : ""}.`,
    });
  } catch (error: any) {
    console.error("[pay-now] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Payment processing failed" }, { status: 500 });
  }
}
