import { NextRequest, NextResponse } from "next/server";
import { registerUser } from "@/lib/auth";
import {
  getInviteTokenByToken,
  createConnection,
  incrementInviteTokenUseCount,
  createInviteTokenUse,
} from "@/lib/db";

export async function POST(request: NextRequest) {
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
      payoutMethod,
      payoutVenmo,
      payoutPaypal,
      payoutCashapp,
      payoutBankRouting,
      payoutBankAccount,
      inviteToken,
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
      payoutMethod,
      payoutVenmo,
      payoutPaypal,
      payoutCashapp,
      payoutBankRouting,
      payoutBankAccount,
    });

    if (!result.success || !result.user) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // If provider registered via invite token, auto-create the connection
    if (role === "provider" && tokenRow && result.user) {
      const connection = await createConnection({
        provider_id: result.user.id,
        buyer_id: tokenRow.buyer_id,
        initiator: "buyer",
        status: "active",
        accepted_at: new Date().toISOString(),
        rate_per_lead: Number(tokenRow.rate_per_lead),
        payment_timing: tokenRow.payment_timing as 'per_lead' | 'weekly' | 'biweekly' | 'monthly',
        weekly_lead_cap: tokenRow.weekly_lead_cap,
        monthly_lead_cap: tokenRow.monthly_lead_cap,
        termination_notice_days: tokenRow.termination_notice_days,
        invite_token_id: tokenRow.id,
      });

      await incrementInviteTokenUseCount(tokenRow.id);
      await createInviteTokenUse(tokenRow.id, result.user.id, connection.id);
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
