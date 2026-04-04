import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import crypto from "crypto";
import {
  createInvite,
  getInvitesByBuyerId,
  cancelInvite,
  getUserByEmail,
  getUserById,
} from "@/lib/db";

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString("base64url");
}

// POST /api/invites - Create a new invite (buyer only)
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can create invites" }, { status: 403 });
    }

    const body = await request.json();
    const {
      providerEmail,
      providerPhone,
      providerName,
      ratePerLead,
      paymentTiming,
      weeklyLeadCap,
      monthlyLeadCap,
      terminationNoticeDays,
      message,
    } = body;

    // If email provided and user already registered, tell frontend to use connections API
    if (providerEmail) {
      const existingUser = await getUserByEmail(providerEmail);
      if (existingUser && existingUser.role === "provider") {
        return NextResponse.json(
          { error: "provider_exists", providerId: existingUser.id },
          { status: 409 }
        );
      }
    }

    const inviteCode = generateInviteCode();
    const buyer = await getUserById(session.user.id);

    const invite = await createInvite({
      buyer_id: session.user.id,
      invite_code: inviteCode,
      provider_email: providerEmail || undefined,
      provider_phone: providerPhone || undefined,
      provider_name: providerName || undefined,
      rate_per_lead: ratePerLead,
      payment_timing: paymentTiming,
      weekly_lead_cap: weeklyLeadCap || undefined,
      monthly_lead_cap: monthlyLeadCap || undefined,
      termination_notice_days: terminationNoticeDays,
      message: message || undefined,
    });

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.womleads.com";
    const inviteUrl = `${siteUrl}/auth/register?invite=${inviteCode}`;

    // Try to send invite email if email provided and Resend is configured
    let emailSent = false;
    if (providerEmail && process.env.RESEND_API_KEY) {
      try {
        const { sendInviteEmail } = await import("@/lib/email");
        const emailResult = await sendInviteEmail(
          providerEmail,
          buyer?.business_name || buyer?.display_name || "A business",
          inviteUrl,
          message || undefined
        );
        emailSent = emailResult.success;
      } catch (e) {
        console.error("[INVITES] Failed to send invite email:", e);
      }
    }

    return NextResponse.json({
      success: true,
      invite,
      inviteUrl,
      emailSent,
    });
  } catch (error) {
    console.error("[INVITES] Error creating invite:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: `Failed to create invite: ${message}` }, { status: 500 });
  }
}

// GET /api/invites - List invites for the current buyer
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can view invites" }, { status: 403 });
    }

    const invites = await getInvitesByBuyerId(session.user.id);

    return NextResponse.json({ success: true, invites });
  } catch (error) {
    console.error("[INVITES] Error listing invites:", error);
    return NextResponse.json({ error: "Failed to list invites" }, { status: 500 });
  }
}

// DELETE /api/invites - Cancel an invite
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const inviteId = searchParams.get("id");

    if (!inviteId) {
      return NextResponse.json({ error: "Invite ID is required" }, { status: 400 });
    }

    const result = await cancelInvite(inviteId, session.user.id);
    if (!result) {
      return NextResponse.json({ error: "Invite not found or already used" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[INVITES] Error cancelling invite:", error);
    return NextResponse.json({ error: "Failed to cancel invite" }, { status: 500 });
  }
}
