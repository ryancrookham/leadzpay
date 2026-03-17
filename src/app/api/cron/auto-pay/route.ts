import { NextRequest, NextResponse } from "next/server";
import {
  getAutoPayBuyers,
  autoApproveLeads,
  getApprovedLeadsByBuyerId,
  updateNextAutoPayDate,
} from "@/lib/db";
import { processBatchPayment } from "@/lib/payments";

function calculateNextAutoPayDate(schedule: string): Date {
  const now = new Date();
  const next = new Date(now);

  switch (schedule) {
    case "weekly":
      next.setDate(now.getDate() + 7);
      break;
    case "biweekly":
      next.setDate(now.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(now.getMonth() + 1);
      break;
    default:
      next.setDate(now.getDate() + 14);
  }

  next.setUTCHours(10, 0, 0, 0);
  return next;
}

/**
 * GET /api/cron/auto-pay
 * Vercel Cron — runs daily at 10am UTC.
 * Auto-approves old pending leads and processes payments for buyers with auto-pay enabled.
 */
export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyers = await getAutoPayBuyers();
    console.log(`[auto-pay cron] Processing ${buyers.length} buyer(s)`);

    const summary: Array<{
      buyerId: string;
      autoApproved: number;
      approvedTotal: number;
      succeeded: number;
      failed: number;
      skipped3ds: number;
      error?: string;
    }> = [];

    for (const buyer of buyers) {
      try {
        // Step 1: Auto-approve leads past the review window
        const approvedIds = await autoApproveLeads(buyer.id, buyer.review_window_days);
        console.log(`[auto-pay cron] Buyer ${buyer.id}: auto-approved ${approvedIds.length} leads`);

        // Step 2: Get all approved leads
        const approvedLeads = await getApprovedLeadsByBuyerId(buyer.id);

        if (approvedLeads.length === 0) {
          // No leads to pay — still advance the schedule
          const nextDate = calculateNextAutoPayDate(buyer.auto_pay_schedule);
          await updateNextAutoPayDate(buyer.id, nextDate);
          summary.push({
            buyerId: buyer.id,
            autoApproved: approvedIds.length,
            approvedTotal: 0,
            succeeded: 0,
            failed: 0,
            skipped3ds: 0,
          });
          continue;
        }

        // Step 3: Process payment
        const result = await processBatchPayment(buyer.id, approvedLeads);

        if (result.needsSetup) {
          console.warn(`[auto-pay cron] Buyer ${buyer.id}: no payment method, skipping`);
          const nextDate = calculateNextAutoPayDate(buyer.auto_pay_schedule);
          await updateNextAutoPayDate(buyer.id, nextDate);
          summary.push({
            buyerId: buyer.id,
            autoApproved: approvedIds.length,
            approvedTotal: approvedLeads.length,
            succeeded: 0,
            failed: 0,
            skipped3ds: 0,
            error: "No payment method configured",
          });
          continue;
        }

        const succeeded = result.results.filter(r => r.status === "succeeded").length;
        const failed = result.results.filter(r => r.status === "failed").length;
        const skipped3ds = result.results.filter(r => r.status === "requires_action").length;

        if (skipped3ds > 0) {
          console.warn(`[auto-pay cron] Buyer ${buyer.id}: ${skipped3ds} provider(s) require 3DS — cannot process automatically`);
        }

        // Step 4: Advance schedule
        const nextDate = calculateNextAutoPayDate(buyer.auto_pay_schedule);
        await updateNextAutoPayDate(buyer.id, nextDate);

        summary.push({
          buyerId: buyer.id,
          autoApproved: approvedIds.length,
          approvedTotal: approvedLeads.length,
          succeeded,
          failed,
          skipped3ds,
        });

        console.log(`[auto-pay cron] Buyer ${buyer.id}: ${succeeded} succeeded, ${failed} failed, ${skipped3ds} require 3DS`);
      } catch (err: any) {
        console.error(`[auto-pay cron] Buyer ${buyer.id} error:`, err?.message);
        // Still advance schedule to avoid stuck retries
        try {
          const nextDate = calculateNextAutoPayDate(buyer.auto_pay_schedule);
          await updateNextAutoPayDate(buyer.id, nextDate);
        } catch {}
        summary.push({
          buyerId: buyer.id,
          autoApproved: 0,
          approvedTotal: 0,
          succeeded: 0,
          failed: 0,
          skipped3ds: 0,
          error: err?.message || "Unknown error",
        });
      }
    }

    return NextResponse.json({ success: true, processed: buyers.length, summary });
  } catch (error: any) {
    console.error("[auto-pay cron] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Cron job failed" }, { status: 500 });
  }
}
