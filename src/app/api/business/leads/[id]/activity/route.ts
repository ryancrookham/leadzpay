import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, getActivityLog } from "@/lib/db";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can view activity" }, { status: 403 });
    }

    const { id } = await params;
    const lead = await getLeadById(id);
    if (!lead || lead.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const entries = await getActivityLog(id);
    return NextResponse.json({ success: true, entries });
  } catch (error) {
    console.error("[ACTIVITY-LOG] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch activity log" }, { status: 500 });
  }
}
