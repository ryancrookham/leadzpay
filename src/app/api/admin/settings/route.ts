import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/db";

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const settings = await getPlatformSettings();
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 401 });
    }
    const body = await request.json();
    const {
      fee_type, fee_total, fee_buyer, fee_provider,
      fee_percent, fee_percent_buyer_share,
      fee_mixed_flat, fee_mixed_percent, fee_mixed_buyer_share
    } = body;

    // Validate fee_type
    if (fee_type && !['flat', 'percent', 'mixed'].includes(fee_type)) {
      return NextResponse.json({ error: "fee_type must be 'flat', 'percent', or 'mixed'" }, { status: 400 });
    }

    // Validate non-negative numbers
    const numFields = { fee_total, fee_buyer, fee_provider, fee_percent, fee_percent_buyer_share, fee_mixed_flat, fee_mixed_percent, fee_mixed_buyer_share };
    for (const [key, val] of Object.entries(numFields)) {
      if (val !== undefined && (typeof val !== "number" || val < 0)) {
        return NextResponse.json({ error: `${key} must be a non-negative number` }, { status: 400 });
      }
    }

    // Validate flat mode: buyer + provider = total
    if (fee_type === 'flat' && fee_total !== undefined && fee_buyer !== undefined && fee_provider !== undefined) {
      const sum = Math.round((fee_buyer + fee_provider) * 100);
      const total = Math.round(fee_total * 100);
      if (sum !== total) {
        return NextResponse.json({ error: "fee_buyer + fee_provider must equal fee_total" }, { status: 400 });
      }
    }

    // Validate percent mode
    if (fee_type === 'percent' && fee_percent !== undefined && fee_percent > 100) {
      return NextResponse.json({ error: "fee_percent must be between 0 and 100" }, { status: 400 });
    }
    if (fee_percent_buyer_share !== undefined && (fee_percent_buyer_share < 0 || fee_percent_buyer_share > 100)) {
      return NextResponse.json({ error: "buyer_share must be between 0 and 100" }, { status: 400 });
    }

    // Validate mixed mode
    if (fee_type === 'mixed' && fee_mixed_percent !== undefined && fee_mixed_percent > 100) {
      return NextResponse.json({ error: "fee_mixed_percent must be between 0 and 100" }, { status: 400 });
    }
    if (fee_mixed_buyer_share !== undefined && (fee_mixed_buyer_share < 0 || fee_mixed_buyer_share > 100)) {
      return NextResponse.json({ error: "mixed buyer_share must be between 0 and 100" }, { status: 400 });
    }

    const updated = await updatePlatformSettings({
      fee_type, fee_total, fee_buyer, fee_provider,
      fee_percent, fee_percent_buyer_share,
      fee_mixed_flat, fee_mixed_percent, fee_mixed_buyer_share
    });
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
