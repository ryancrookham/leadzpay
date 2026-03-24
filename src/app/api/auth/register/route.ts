import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import {
  getInviteTokenByToken,
  createConnection,
  incrementInviteTokenUseCount,
  createInviteTokenUse,
  getInviteByCode,
  markInviteAccepted,
  getActiveBusinessCriteria,
  updateProviderOnboardingStep,
} from "@/lib/db";
import { withRateLimit } from "@/lib/server/api-auth";

async function _POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      email,
      password,
      username,
      role,
      displayName,
      phone,
      location,
      businessName,
      businessType,
      licensedStates,
      profilePictureUrl,
      inviteToken,
      inviteCode,
    } = body;

    // Validate required fields
    if (!email || !password || !username || !role) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate password
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 8 characters" },
        { status: 400 }
      );
    }

    // Validate role
    if (role !== "provider" && role !== "buyer") {
      return NextResponse.json(
        { success: false, error: "Invalid role" },
        { status: 400 }
      );
    }

    // Buyers must provide business name and type
    if (role === "buyer") {
      if (!businessName || !businessType) {
        return NextResponse.json(
          { success: false, error: "Business name and business type are required for business accounts" },
          { status: 400 }
        );
      }
    }

    // For providers with an invite token, validate it before registration
    let tokenRow = null;
    if (role === "provider" && inviteToken) {
      tokenRow = await getInviteTokenByToken(inviteToken);
      if (!tokenRow) {
        return NextResponse.json(
          { success: false, error: "Invite link not found" },
          { status: 400 }
        );
      }
      if (!tokenRow.is_active) {
        return NextResponse.json(
          { success: false, error: "This invite link has been deactivated" },
          { status: 400 }
        );
      }
      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        return NextResponse.json(
          { success: false, error: "This invite link has expired" },
          { status: 400 }
        );
      }
      if (tokenRow.max_uses !== null && tokenRow.use_count >= tokenRow.max_uses) {
        return NextResponse.json(
          { success: false, error: "This invite link has reached its maximum uses" },
          { status: 400 }
        );
      }
    }

    // Register user
    const result = await registerUser({
      email,
      password,
      username,
      role,
      displayName,
      phone,
      location,
      businessName,
      businessType,
      licensedStates,
      profilePictureUrl,
    });

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // If provider registered via invite token, auto-create the connection
    if (role === "provider" && tokenRow && result.user) {
      // Look up business criteria to stamp on connection
      const criteria = await getActiveBusinessCriteria(tokenRow.buyer_id);

      const connection = await createConnection({
        provider_id: result.user.id,
        buyer_id: tokenRow.buyer_id,
        initiator: "buyer",
        status: "active",
        accepted_at: new Date().toISOString(),
        rate_per_lead: criteria ? Number(criteria.payout_per_lead) : Number(tokenRow.rate_per_lead),
        payment_timing: tokenRow.payment_timing as string,
        weekly_lead_cap: criteria ? criteria.weekly_cap : tokenRow.weekly_lead_cap,
        monthly_lead_cap: criteria ? criteria.monthly_cap : tokenRow.monthly_lead_cap,
        termination_notice_days: tokenRow.termination_notice_days,
        invite_token_id: tokenRow.id,
        criteria_id: criteria?.id,
      });

      await incrementInviteTokenUseCount(tokenRow.id);
      await createInviteTokenUse(tokenRow.id, result.user.id, connection.id);

      // Steps 1-3 (terms, criteria, profile) were completed pre-registration
      // Set onboarding to step 4 (Stripe setup)
      await updateProviderOnboardingStep(result.user.id, 4);
    }

    // Handle invite code — create connection with pre-negotiated terms
    if (inviteCode && result.user) {
      try {
        const invite = await getInviteByCode(inviteCode);
        if (invite && invite.status === "pending" && new Date(invite.expires_at) > new Date()) {
          await createConnection({
            provider_id: result.user.id,
            buyer_id: invite.buyer_id,
            initiator: "buyer",
            status: "pending_provider_accept",
            rate_per_lead: Number(invite.rate_per_lead),
            payment_timing: invite.payment_timing as string,
            weekly_lead_cap: invite.weekly_lead_cap || undefined,
            monthly_lead_cap: invite.monthly_lead_cap || undefined,
            termination_notice_days: invite.termination_notice_days,
            message: invite.message || undefined,
          });

          await markInviteAccepted(invite.id, result.user.id);
          console.log(`[REGISTER] Invite ${inviteCode} accepted by user ${result.user.id}`);
        }
      } catch (inviteError) {
        // Don't fail registration if invite processing fails
        console.error("[REGISTER] Error processing invite code:", inviteError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[REGISTER] Error:", errorMessage, error);
    return NextResponse.json(
      { success: false, error: `Registration failed: ${errorMessage}` },
      { status: 500 }
    );
  }
}

export const POST = withRateLimit(_POST, { limit: 5, windowMs: 3600000, keyPrefix: "register" });
