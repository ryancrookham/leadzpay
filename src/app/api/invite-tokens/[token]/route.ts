import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getInviteTokenByToken,
  getUserById,
  deactivateInviteToken,
  deleteInviteTokenPermanently,
  updateInviteToken,
  getBusinessCriteriaWithFields,
} from "@/lib/db";

// GET /api/invite-tokens/[token] — public validation, no auth required
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const tokenRow = await getInviteTokenByToken(token);

    if (!tokenRow) {
      return NextResponse.json({ valid: false, error: "Invite link not found" });
    }

    if (!tokenRow.is_active) {
      return NextResponse.json({ valid: false, error: "This invite link has been deactivated" });
    }

    if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "This invite link has expired" });
    }

    if (tokenRow.max_uses !== null && tokenRow.use_count >= tokenRow.max_uses) {
      return NextResponse.json({ valid: false, error: "This invite link has reached its maximum uses" });
    }

    // Fetch the buyer info to show branding
    const buyer = await getUserById(tokenRow.buyer_id);
    if (!buyer) {
      return NextResponse.json({ valid: false, error: "Business not found" });
    }

    // Also fetch business criteria if available
    const criteriaResult = await getBusinessCriteriaWithFields(tokenRow.buyer_id);

    return NextResponse.json({
      valid: true,
      businessName: buyer.business_name || buyer.username,
      channelName: tokenRow.channel_name,
      channelDescription: tokenRow.channel_description,
      ratePerLead: criteriaResult ? Number(criteriaResult.criteria.payout_per_lead) : Number(tokenRow.rate_per_lead),
      paymentTiming: tokenRow.payment_timing,
      weeklyLeadCap: criteriaResult ? criteriaResult.criteria.weekly_cap : tokenRow.weekly_lead_cap,
      monthlyLeadCap: criteriaResult ? criteriaResult.criteria.monthly_cap : tokenRow.monthly_lead_cap,
      terminationNoticeDays: tokenRow.termination_notice_days,
      criteria: criteriaResult?.criteria || null,
      criteriaFields: criteriaResult?.fields || [],
    });
  } catch (error) {
    console.error("[INVITE-TOKENS] GET [token] error:", error);
    return NextResponse.json({ valid: false, error: "Failed to validate invite link" });
  }
}

// PATCH /api/invite-tokens/[token] — update token (buyer auth, must own it)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { token } = await params;
    const tokenRow = await getInviteTokenByToken(token);
    if (!tokenRow) {
      return NextResponse.json({ error: "Invite token not found" }, { status: 404 });
    }

    if (tokenRow.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const body = await request.json();
    const updated = await updateInviteToken(tokenRow.id, {
      label: body.label,
      channel_name: body.channelName,
      channel_description: body.channelDescription,
      is_active: body.isActive,
    });

    return NextResponse.json({ token: updated });
  } catch (error) {
    console.error("[INVITE-TOKENS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update invite token" }, { status: 500 });
  }
}

// DELETE /api/invite-tokens/[token] — deactivate token (buyer auth, must own it)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { token } = await params;
    const tokenRow = await getInviteTokenByToken(token);
    if (!tokenRow) {
      return NextResponse.json({ error: "Invite token not found" }, { status: 404 });
    }

    if (tokenRow.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const permanent = request.nextUrl.searchParams.get("permanent") === "true";
    if (permanent) {
      await deleteInviteTokenPermanently(tokenRow.id);
    } else {
      await deactivateInviteToken(tokenRow.id);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[INVITE-TOKENS] DELETE error:", error);
    return NextResponse.json({ error: "Failed to delete invite token" }, { status: 500 });
  }
}
