import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlatformStats, getRevenueByDay, getAllLeadsForAdmin, getLeadsPendingForwarding, getAllUsers } from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

export async function GET() {
  try {
    // Verify admin via NextAuth session
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const [stats, revenueByDay, recentLeads, pendingPayoutLeads, users] = await Promise.all([
      getPlatformStats(),
      getRevenueByDay(30),
      getAllLeadsForAdmin(50),
      getLeadsPendingForwarding(),
      getAllUsers(),
    ]);

    // Sanitize leads for admin view (no encrypted PII)
    const sanitizedLeads = recentLeads.map((lead) => ({
      id: lead.id,
      providerName: (lead as any).provider_name || "Unknown",
      buyerName: (lead as any).buyer_business_name || (lead as any).buyer_name || "Unknown",
      payoutAmount: lead.payout_amount,
      buyerTotal: calculateFeeBreakdown(lead.payout_amount).buyerTotal,
      providerNet: calculateFeeBreakdown(lead.payout_amount).providerNet,
      platformFee: calculateFeeBreakdown(lead.payout_amount).totalPlatformFee,
      payoutStatus: lead.payout_status,
      submittedAt: lead.submitted_at,
      vehicleInfo: [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(" ") || null,
      customerState: lead.customer_state,
    }));

    // Group pending payouts by provider
    const providerGroups: Record<string, {
      providerId: string;
      providerName: string;
      providerVenmo: string | null;
      providerPayoutMethod: string | null;
      leads: { id: string; buyerName: string; vehicleInfo: string | null; providerNet: number; submittedAt: string }[];
      totalNet: number;
    }> = {};

    for (const lead of pendingPayoutLeads) {
      const pid = lead.provider_id;
      if (!providerGroups[pid]) {
        providerGroups[pid] = {
          providerId: pid,
          providerName: (lead as any).provider_name || "Unknown",
          providerVenmo: lead.provider_venmo || null,
          providerPayoutMethod: lead.provider_payout_method || null,
          leads: [],
          totalNet: 0,
        };
      }
      const net = calculateFeeBreakdown(lead.payout_amount).providerNet;
      providerGroups[pid].leads.push({
        id: lead.id,
        buyerName: (lead as any).buyer_business_name || (lead as any).buyer_name || "Unknown",
        vehicleInfo: [lead.vehicle_year, lead.vehicle_make, lead.vehicle_model].filter(Boolean).join(" ") || null,
        providerNet: net,
        submittedAt: lead.submitted_at,
      });
      providerGroups[pid].totalNet += net;
    }

    const pendingPayouts = Object.values(providerGroups);

    // Sanitize users for admin view
    const sanitizedUsers = users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.username,
      role: u.role,
      displayName: u.display_name || u.username,
      businessName: u.business_name,
      phone: u.phone,
      location: u.location,
      isActive: u.is_active,
      createdAt: u.created_at,
      payoutMethod: u.payout_method,
      payoutVenmo: u.payout_venmo,
      totalLeads: (u as any).total_leads || 0,
      totalVolume: Number((u as any).total_volume || 0),
    }));

    return NextResponse.json({
      success: true,
      stats,
      revenueByDay,
      recentLeads: sanitizedLeads,
      pendingPayouts,
      users: sanitizedUsers,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
