import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getPlatformStats, getAllLeadsForAdmin,
  getPlatformSettings, getDetailedUserStats
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin authentication required" }, { status: 401 });
    }

    const [stats, recentLeads, platformFees, detailedUsersRaw] = await Promise.all([
      getPlatformStats(),
      getAllLeadsForAdmin(10),
      getPlatformSettings(),
      getDetailedUserStats(),
    ]);

    // Sanitize leads for admin view (no encrypted PII)
    const sanitizedLeads = recentLeads.map((lead) => {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
      return {
        id: lead.id,
        providerName: (lead as any).provider_name || "Unknown",
        buyerName: (lead as any).buyer_business_name || (lead as any).buyer_name || "Unknown",
        payoutAmount: lead.payout_amount,
        platformFee: breakdown.totalPlatformFee,
        payoutStatus: lead.payout_status,
        submittedAt: lead.submitted_at,
      };
    });

    // Count leads this month
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const leadsThisMonth = recentLeads.filter(
      (l) => new Date(l.submitted_at) >= monthStart
    ).length;

    // Detailed users for Users + Platform tabs
    const detailedUsers = detailedUsersRaw.map((u) => ({
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
      totalLeads: Number((u as any).total_leads || 0),
      totalVolume: Number((u as any).total_volume || 0),
      lastLeadAt: (u as any).last_lead_at || null,
      yearlyEarnings: Number((u as any).yearly_earnings || 0),
      needs1099: Number((u as any).yearly_earnings || 0) >= 600,
      disabledAt: u.disabled_at || null,
    }));

    // Twilio status from env vars
    const twilioStatus = {
      configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER),
      phoneNumber: process.env.TWILIO_PHONE_NUMBER || null,
    };

    return NextResponse.json({
      success: true,
      stats,
      recentLeads: sanitizedLeads,
      leadsThisMonth,
      platformFees,
      detailedUsers,
      twilioStatus,
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Failed to fetch admin stats" }, { status: 500 });
  }
}
