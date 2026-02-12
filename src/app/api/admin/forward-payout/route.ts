import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, updateLeadPayoutStatus, executeSql } from "@/lib/db";

/**
 * POST /api/admin/forward-payout - Admin marks leads as forwarded to provider
 * Accepts { leadIds: string[] } for batch forwarding
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { leadIds } = await request.json();
    if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds array required" }, { status: 400 });
    }

    const results: { id: string; success: boolean; error?: string }[] = [];
    const sql = executeSql;

    for (const leadId of leadIds) {
      const lead = await getLeadById(leadId);
      if (!lead) {
        results.push({ id: leadId, success: false, error: "Lead not found" });
        continue;
      }

      if (lead.payout_status !== "processing") {
        results.push({ id: leadId, success: false, error: `Status is '${lead.payout_status}', expected 'processing'` });
        continue;
      }

      // Mark lead as completed (payment forwarded to provider)
      await updateLeadPayoutStatus(leadId, "completed");

      // Mark lead_payout transaction as completed
      await sql`
        UPDATE transactions
        SET status = 'completed', completed_at = NOW()
        WHERE lead_id = ${leadId} AND type = 'lead_payout' AND status = 'pending'
      `;

      results.push({ id: leadId, success: true });
    }

    const successCount = results.filter(r => r.success).length;
    return NextResponse.json({
      success: true,
      forwarded: successCount,
      total: leadIds.length,
      results,
    });
  } catch (error) {
    console.error("Forward payout error:", error);
    return NextResponse.json({ error: "Failed to forward payout" }, { status: 500 });
  }
}
