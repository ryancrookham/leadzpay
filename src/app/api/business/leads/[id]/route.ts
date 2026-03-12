import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadById, updateLeadQuoteCompleted } from "@/lib/db";

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
    const { quote_completed } = body;

    if (typeof quote_completed !== "boolean") {
      return NextResponse.json({ error: "quote_completed must be a boolean" }, { status: 400 });
    }

    const lead = await getLeadById(id);
    if (!lead || lead.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    }

    const updated = await updateLeadQuoteCompleted(id, quote_completed);
    return NextResponse.json({ success: true, lead: updated });
  } catch (error) {
    console.error("[BUSINESS-LEADS] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update lead" }, { status: 500 });
  }
}
