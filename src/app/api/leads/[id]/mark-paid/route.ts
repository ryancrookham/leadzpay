import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, updateLeadPayoutStatus, executeSql } from "@/lib/db";

/**
 * POST /api/leads/[id]/mark-paid - Business marks a lead as paid
 * Updates lead payout_status and matching transaction status
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can mark leads as paid" }, { status: 403 });
    }

    const { id: leadId } = await params;

    // Get the lead
    const lead = await getLeadById(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Verify this lead belongs to the buyer
    if (lead.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Not your lead" }, { status: 403 });
    }

    if (lead.payout_status === "completed" || lead.payout_status === "processing") {
      return NextResponse.json({ error: "Lead payment already recorded" }, { status: 400 });
    }

    // Mark as processing (buyer paid WOML, awaiting admin forward to provider)
    const updated = await updateLeadPayoutStatus(leadId, "processing");

    // Only mark platform_fee transaction as completed (WOML received their fee)
    // Leave lead_payout transaction as pending (provider hasn't been paid yet)
    const sql = executeSql;
    await sql`
      UPDATE transactions
      SET status = 'completed', completed_at = NOW()
      WHERE lead_id = ${leadId} AND type = 'platform_fee' AND status = 'pending'
    `;

    return NextResponse.json({
      success: true,
      lead: {
        id: updated?.id,
        payoutStatus: updated?.payout_status,
        payoutCompletedAt: updated?.payout_completed_at,
      },
    });
  } catch (error) {
    console.error("Mark paid error:", error);
    return NextResponse.json({ error: "Failed to mark lead as paid" }, { status: 500 });
  }
}
