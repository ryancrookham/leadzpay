import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectionById, getPendingProposal, getCriteriaById, getCriteriaFields } from "@/lib/db";

// GET /api/connections/[id]/pending-proposal — Check for pending term proposal
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }

    // Either buyer or provider can check
    if (connection.buyer_id !== session.user.id && connection.provider_id !== session.user.id) {
      return NextResponse.json({ error: "Not authorized for this connection" }, { status: 403 });
    }

    // Always fetch current criteria + fields (needed for modal pre-population)
    let currentCriteria = null;
    let currentFields: Awaited<ReturnType<typeof getCriteriaFields>> = [];
    if (connection.criteria_id) {
      currentCriteria = await getCriteriaById(connection.criteria_id);
      if (currentCriteria) {
        currentFields = await getCriteriaFields(currentCriteria.id);
      }
    }

    const proposal = await getPendingProposal(id);
    if (!proposal) {
      return NextResponse.json({ proposal: null, currentCriteria, currentFields });
    }

    // Fetch proposed criteria + fields
    const proposedCriteria = await getCriteriaById(proposal.proposed_criteria_id);
    const proposedFields = proposedCriteria ? await getCriteriaFields(proposedCriteria.id) : [];

    return NextResponse.json({
      proposal,
      proposedCriteria,
      proposedFields,
      currentCriteria,
      currentFields,
    });
  } catch (error) {
    console.error("[PENDING-PROPOSAL] Error:", error);
    return NextResponse.json({ error: "Failed to check proposal" }, { status: 500 });
  }
}
