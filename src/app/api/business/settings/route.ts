import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessSettings, upsertBusinessSettings } from "@/lib/db";

const VALID_WINDOW_DAYS = [7, 14, 30, 60, 90];

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can access settings" }, { status: 403 });
    }

    const settings = await getBusinessSettings(session.user.id);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[BUSINESS-SETTINGS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can update settings" }, { status: 403 });
    }

    const body = await request.json();

    if (body.dead_lead_window_days !== undefined) {
      if (!VALID_WINDOW_DAYS.includes(body.dead_lead_window_days)) {
        return NextResponse.json({ error: "Invalid dead_lead_window_days. Must be 7, 14, 30, 60, or 90." }, { status: 400 });
      }
      await upsertBusinessSettings(session.user.id, { dead_lead_window_days: body.dead_lead_window_days });
    }

    const settings = await getBusinessSettings(session.user.id);
    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error("[BUSINESS-SETTINGS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
