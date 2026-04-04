import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadsByIds, batchMarkLeadsPaid } from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can mark leads as paid" }, { status: 403 });
    }

    const body = await request.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds must be a non-empty array" }, { status: 400 });
    }

    if (leadIds.length > 500) {
      return NextResponse.json({ error: "Maximum 500 leads per batch" }, { status: 400 });
    }

    // Validate all leads belong to the buyer and are pending
    const leads = await getLeadsByIds(leadIds);

    if (leads.length !== leadIds.length) {
      return NextResponse.json({ error: "Some leads not found" }, { status: 404 });
    }

    const notOwned = leads.find(l => l.buyer_id !== session.user!.id);
    if (notOwned) {
      return NextResponse.json({ error: "Not all leads belong to you" }, { status: 403 });
    }

    const notPending = leads.find(l => l.payout_status !== "pending");
    if (notPending) {
      return NextResponse.json({ error: "Some leads are already paid or processing" }, { status: 400 });
    }

    const count = await batchMarkLeadsPaid(leadIds);

    return NextResponse.json({ success: true, count });
  } catch (error) {
    console.error("Batch mark paid error:", error);
    return NextResponse.json({ error: "Failed to batch mark leads as paid" }, { status: 500 });
  }
}
