import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getInviteTokensByBuyer, createInviteToken } from "@/lib/db";
import crypto from "crypto";

// GET /api/invite-tokens — list all invite tokens for the authenticated buyer
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can manage invite tokens" }, { status: 403 });
    }

    const tokens = await getInviteTokensByBuyer(session.user.id);
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("[INVITE-TOKENS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch invite tokens" }, { status: 500 });
  }
}

// POST /api/invite-tokens — create a new invite token
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can create invite tokens" }, { status: 403 });
    }

    const body = await request.json();
    const {
      label,
      channelName,
      channelDescription,
      ratePerLead,
      paymentTiming,
      weeklyCap,
      monthlyCap,
      terminationNoticeDays,
      maxUses,
      expiresAt,
    } = body;

    // Validate rate per lead
    const rate = Number(ratePerLead);
    if (!rate || rate < 5 || rate > 500) {
      return NextResponse.json(
        { error: "Rate per lead must be between $5 and $500" },
        { status: 400 }
      );
    }

    // Generate a unique 64-char hex token (32 random bytes)
    const token = crypto.randomBytes(32).toString("hex");

    const inviteToken = await createInviteToken({
      buyer_id: session.user.id,
      token,
      label: label || null,
      channel_name: channelName || null,
      channel_description: channelDescription || null,
      rate_per_lead: rate,
      payment_timing: paymentTiming || "per_lead",
      weekly_lead_cap: weeklyCap ?? null,
      monthly_lead_cap: monthlyCap ?? null,
      termination_notice_days: terminationNoticeDays ?? 7,
      max_uses: maxUses || null,
      expires_at: expiresAt || null,
    });

    const inviteUrl = `https://www.womleads.com/auth/register?token=${token}`;

    return NextResponse.json({ token: inviteToken, inviteUrl }, { status: 201 });
  } catch (error) {
    console.error("[INVITE-TOKENS] POST error:", error);
    return NextResponse.json({ error: "Failed to create invite token" }, { status: 500 });
  }
}
