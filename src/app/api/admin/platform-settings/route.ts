import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPlatformSettings, updatePlatformSettings } from "@/lib/db";

/**
 * GET /api/admin/platform-settings
 * Returns current platform fee settings.
 *
 * POST /api/admin/platform-settings
 * Updates platform fee settings in the DB.
 * Body: Partial<PlatformSettings>
 *
 * To migrate from flat → 12.5% percent fee, POST:
 * { fee_type: "percent", fee_percent: 12.5, fee_percent_buyer_share: 0 }
 */

export async function GET() {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user?.id || role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }
    const settings = await getPlatformSettings();
    return NextResponse.json(settings);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to get settings" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user?.id || role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const updated = await updatePlatformSettings(body);
    return NextResponse.json({ success: true, settings: updated });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Failed to update settings" }, { status: 500 });
  }
}
