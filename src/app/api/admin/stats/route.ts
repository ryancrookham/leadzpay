import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getPlatformStats, getRevenueByDay, getAllLeadsForAdmin } from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

export async function GET() {
  try {
    // Verify admin session (same pattern as admin/auth GET)
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get("admin_session")?.value;
    if (!sessionToken || sessionToken.length < 32) {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const [stats, revenueByDay, recentLeads] = await Promise.all([
      getPlatformStats(),
      getRevenueByDay(30),
      getAllLeadsForAdmin(20),
    ]);

    // Sanitize leads for admin view (no encrypted PII)
    const sanitizedLeads = recentLeads.map((lead) => ({
      id: lead.id,
      providerName: lead.provider_name || "Unknown",
      buyerName: lead.buyer_business_name || lead.buyer_name || "Unknown",
      payoutAmount: lead.payout_amount,
      buyerTotal: calculateFeeBreakdown(lead.payout_amount).buyerTotal,
      providerNet: calculateFeeBreakdown(lead.payout_amount).providerNet,
      platformFee: calculateFeeBreakdown(lead.payout_amount).totalPlatformFee,
      payoutStatus: lead.payout_status,
      submittedAt: lead.submitted_at,
      vehicleInfo: [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(" ") || null,
      customerState: lead.customer_state,
    }));

    return NextResponse.json({
      success: true,
      stats,
      revenueByDay,
      recentLeads: sanitizedLeads,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
