import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getBusinessSettings, sweepDeadLeads, insertActivityLog } from "@/lib/db";

export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can run auto-dead sweep" }, { status: 403 });
    }

    const settings = await getBusinessSettings(session.user.id);
    const sweptIds = await sweepDeadLeads(session.user.id, settings.dead_lead_window_days);

    // Log activity for each swept lead
    for (const leadId of sweptIds) {
      await insertActivityLog({
        lead_id: leadId,
        business_id: session.user.id,
        actor_name: "System",
        action: "status_change",
        from_value: "stale",
        to_value: "dead",
        note: `Auto-marked dead after ${settings.dead_lead_window_days} days of inactivity`,
      });
    }

    return NextResponse.json({ success: true, markedDead: sweptIds.length });
  } catch (error) {
    console.error("[AUTO-DEAD] POST error:", error);
    return NextResponse.json({ error: "Failed to run auto-dead sweep" }, { status: 500 });
  }
}
