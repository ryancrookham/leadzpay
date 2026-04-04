import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectionById, getPendingProposal, acceptTermProposal, rejectTermProposal, getUserById } from "@/lib/db";
import { sendSms, isSinchConfigured } from "@/lib/sinch";

// POST /api/connections/[id]/respond-terms — Provider accepts or rejects proposal
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "provider") {
      return NextResponse.json({ error: "Provider authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (connection.provider_id !== session.user.id) {
      return NextResponse.json({ error: "Not your connection" }, { status: 403 });
    }

    const body = await request.json();
    const { proposalId, action, note } = body;

    if (!proposalId || !["accept", "reject"].includes(action)) {
      return NextResponse.json({ error: "proposalId and action (accept/reject) are required" }, { status: 400 });
    }

    // Validate the proposalId matches the pending proposal for this connection
    const pending = await getPendingProposal(id);
    if (!pending || pending.id !== proposalId) {
      return NextResponse.json({ error: "No matching pending proposal found" }, { status: 404 });
    }

    let result;
    if (action === "accept") {
      result = await acceptTermProposal(proposalId, session.user.id);
    } else {
      result = await rejectTermProposal(proposalId, session.user.id, note);
    }

    if (!result) {
      return NextResponse.json({ error: "Failed to process response" }, { status: 500 });
    }

    // Send SMS to buyer (non-blocking)
    try {
      if (isSinchConfigured()) {
        const buyer = await getUserById(connection.buyer_id);
        const provider = await getUserById(session.user.id);
        const providerName = provider?.display_name || "Your provider";
        if (buyer?.phone) {
          if (action === "accept") {
            await sendSms(buyer.phone, `${providerName} accepted your updated terms. New terms are now in effect.`);
          } else {
            await sendSms(buyer.phone, `${providerName} declined your updated terms. Log in to re-propose or terminate.`);
          }
        }
      }
    } catch (smsErr) {
      console.error("[RESPOND-TERMS] SMS send failed:", smsErr);
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error("[RESPOND-TERMS] Error:", error);
    return NextResponse.json({ error: "Failed to respond to proposal" }, { status: 500 });
  }
}
