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
    const { fee_total, fee_buyer, fee_provider } = body;

    // Validation
    if (fee_total !== undefined && (typeof fee_total !== "number" || fee_total < 0)) {
      return NextResponse.json({ error: "fee_total must be a non-negative number" }, { status: 400 });
    }
    if (fee_buyer !== undefined && (typeof fee_buyer !== "number" || fee_buyer < 0)) {
      return NextResponse.json({ error: "fee_buyer must be a non-negative number" }, { status: 400 });
    }
    if (fee_provider !== undefined && (typeof fee_provider !== "number" || fee_provider < 0)) {
      return NextResponse.json({ error: "fee_provider must be a non-negative number" }, { status: 400 });
    }

    // Validate that buyer + provider = total (if all provided)
    if (fee_total !== undefined && fee_buyer !== undefined && fee_provider !== undefined) {
      const sum = Math.round((fee_buyer + fee_provider) * 100);
      const total = Math.round(fee_total * 100);
      if (sum !== total) {
        return NextResponse.json({ error: "fee_buyer + fee_provider must equal fee_total" }, { status: 400 });
      }
    }

    const updated = await updatePlatformSettings({ fee_total, fee_buyer, fee_provider });
    return NextResponse.json({ success: true, settings: updated });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
