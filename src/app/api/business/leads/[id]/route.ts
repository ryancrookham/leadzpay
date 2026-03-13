import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, updateLeadQuoteCompleted, updateLeadPipeline, insertActivityLog } from "@/lib/db";

const VALID_PIPELINE_STATUSES = ["new", "contacted", "quoted", "sold", "dead"];
const VALID_CONTACT_TYPES = ["quote", "direct_sale"];
const VALID_CONTACTED_SUB = ["reached", "voicemail", "no_answer"];
const VALID_DEAD_REASONS = ["not_interested", "bad_contact", "already_insured", "price", "other"];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can update leads" }, { status: 403 });
    }

    const { id } = await params;
    const body = await request.json();

    const lead = await getLeadById(id);
    if (!lead || lead.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    // Forward-only stage guard
    const STAGE_ORDER: Record<string, number> = { new: 0, contacted: 1, quoted: 2, sold: 3, dead: 3 };
    const TERMINAL = new Set(["sold", "dead"]);

    if (body.pipeline_status) {
      const currentStatus = lead.pipeline_status || "new";
      if (TERMINAL.has(currentStatus)) {
        return NextResponse.json({ error: "This lead is in a terminal state and cannot be changed." }, { status: 400 });
      }
      if ((STAGE_ORDER[body.pipeline_status] ?? 0) <= (STAGE_ORDER[currentStatus] ?? 0)) {
        return NextResponse.json({ error: "Leads can only move forward in the pipeline." }, { status: 400 });
      }
    }

    // Handle quote_completed
    if (typeof body.quote_completed === "boolean") {
      await updateLeadQuoteCompleted(id, body.quote_completed);
    }

    // Handle pipeline fields
    const pipelineFields: {
      pipeline_status?: string;
      contact_type?: string;
      pipeline_notes?: string;
      contacted_sub_status?: string | null;
      dead_reason?: string | null;
      assigned_to?: string | null;
      follow_up_date?: string | null;
    } = {};

    if (body.pipeline_status !== undefined) {
      if (!VALID_PIPELINE_STATUSES.includes(body.pipeline_status)) {
        return NextResponse.json({ error: "Invalid pipeline_status" }, { status: 400 });
      }
      pipelineFields.pipeline_status = body.pipeline_status;
    }
    if (body.contact_type !== undefined) {
      if (body.contact_type !== null && !VALID_CONTACT_TYPES.includes(body.contact_type)) {
        return NextResponse.json({ error: "Invalid contact_type" }, { status: 400 });
      }
      pipelineFields.contact_type = body.contact_type;
    }
    if (body.pipeline_notes !== undefined) {
      pipelineFields.pipeline_notes = body.pipeline_notes;
    }
    if (body.contacted_sub_status !== undefined) {
      if (body.contacted_sub_status !== null && !VALID_CONTACTED_SUB.includes(body.contacted_sub_status)) {
        return NextResponse.json({ error: "Invalid contacted_sub_status" }, { status: 400 });
      }
      pipelineFields.contacted_sub_status = body.contacted_sub_status;
    }
    if (body.dead_reason !== undefined) {
      if (body.dead_reason !== null && !VALID_DEAD_REASONS.includes(body.dead_reason)) {
        return NextResponse.json({ error: "Invalid dead_reason" }, { status: 400 });
      }
      pipelineFields.dead_reason = body.dead_reason;
    }
    if (body.assigned_to !== undefined) {
      pipelineFields.assigned_to = body.assigned_to;
    }
    if (body.follow_up_date !== undefined) {
      pipelineFields.follow_up_date = body.follow_up_date;
    }

    if (Object.keys(pipelineFields).length > 0) {
      await updateLeadPipeline(id, pipelineFields);
    }

    // Activity logging
    const actorName = body.actor_name || (session.user as any).businessName || session.user.email || "Unknown";

    if (pipelineFields.pipeline_status && pipelineFields.pipeline_status !== (lead.pipeline_status || "new")) {
      await insertActivityLog({
        lead_id: id,
        business_id: session.user.id,
        actor_name: actorName,
        action: "status_change",
        from_value: lead.pipeline_status || "new",
        to_value: pipelineFields.pipeline_status,
      });
    }
    if (pipelineFields.assigned_to !== undefined && pipelineFields.assigned_to !== lead.assigned_to) {
      await insertActivityLog({
        lead_id: id,
        business_id: session.user.id,
        actor_name: actorName,
        action: "assigned",
        from_value: lead.assigned_to || null,
        to_value: pipelineFields.assigned_to,
      });
    }
    if (pipelineFields.follow_up_date !== undefined && pipelineFields.follow_up_date !== lead.follow_up_date) {
      await insertActivityLog({
        lead_id: id,
        business_id: session.user.id,
        actor_name: actorName,
        action: "follow_up_set",
        to_value: pipelineFields.follow_up_date,
      });
    }
    if (body.note) {
      await insertActivityLog({
        lead_id: id,
        business_id: session.user.id,
        actor_name: actorName,
        action: "note",
        note: body.note,
      });
    }

    // Return fresh lead
    const updated = await getLeadById(id);
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error("[BUSINESS-LEADS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
