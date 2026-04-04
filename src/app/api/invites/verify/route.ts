import { NextRequest, NextResponse } from "next/server";
import { getInviteByCode } from "@/lib/db";

// GET /api/invites/verify?code=ABC123 - Public endpoint to verify an invite code
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({ valid: false, reason: "No invite code provided" });
    }

    const invite = await getInviteByCode(code);

    if (!invite) {
      return NextResponse.json({ valid: false, reason: "Invalid invite code" });
    }

    if (invite.status !== "pending") {
      return NextResponse.json({ valid: false, reason: `Invite has been ${invite.status}` });
    }

    if (new Date(invite.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, reason: "Invite has expired" });
    }

    return NextResponse.json({
      valid: true,
      businessName: invite.buyer_business_name || invite.buyer_display_name || "A business on WOML",
      ratePerLead: invite.rate_per_lead,
      message: invite.message,
    });
  } catch (error) {
    console.error("[INVITES] Error verifying invite:", error);
    return NextResponse.json({ valid: false, reason: "Failed to verify invite" });
  }
}
