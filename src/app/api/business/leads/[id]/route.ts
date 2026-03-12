import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, updateLeadQuoteCompleted, updateLeadPipeline } from "@/lib/db";

const VALID_PIPELINE_STATUSES = ["new", "contacted", "quoted", "sold", "dead"];
const VALID_CONTACT_TYPES = ["quote", "direct_sale"];

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

    // Handle quote_completed
    if (typeof body.quote_completed === "boolean") {
      await updateLeadQuoteCompleted(id, body.quote_completed);
    }

    // Handle pipeline fields
    const pipelineFields: { pipeline_status?: string; contact_type?: string; pipeline_notes?: string } = {};
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

    if (Object.keys(pipelineFields).length > 0) {
      await updateLeadPipeline(id, pipelineFields);
    }

    // Return fresh lead
    const updated = await getLeadById(id);
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error("[BUSINESS-LEADS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
