import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, rejectLead } from "@/lib/db";

const PRESET_REASONS = [
  "Unresponsive number",
  "Bad/fake data",
  "Duplicate lead",
  "Wrong area/state",
  "Incomplete information",
  "Other",
] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can reject leads" }, { status: 403 });
    }

    const { id: leadId } = await params;
    const body = await request.json();
    const { reason, customReason } = body;

    if (!reason || !PRESET_REASONS.includes(reason)) {
      return NextResponse.json({ error: "Invalid rejection reason" }, { status: 400 });
    }

    if (reason === "Other" && (!customReason || typeof customReason !== "string" || customReason.trim().length === 0)) {
      return NextResponse.json({ error: "Custom reason is required when selecting 'Other'" }, { status: 400 });
    }

    if (reason === "Other" && customReason.length > 200) {
      return NextResponse.json({ error: "Custom reason must be 200 characters or less" }, { status: 400 });
    }

    const lead = await getLeadById(leadId);
    if (!lead) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    if (lead.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "This lead does not belong to you" }, { status: 403 });
    }

    if (lead.payout_status !== "pending") {
      return NextResponse.json({ error: "Only pending leads can be rejected" }, { status: 400 });
    }

    const finalReason = reason === "Other" ? customReason.trim() : reason;
    const updated = await rejectLead(leadId, session.user.id, finalReason);

    if (!updated) {
      return NextResponse.json({ error: "Failed to reject lead — it may have already been processed" }, { status: 409 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[reject-lead] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Failed to reject lead" }, { status: 500 });
  }
}
