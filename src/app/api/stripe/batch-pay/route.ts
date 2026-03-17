import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getLeadsByIds } from "@/lib/db";
import { processBatchPayment } from "@/lib/payments";

/**
 * POST /api/stripe/batch-pay
 * Charge buyer's saved payment method server-side for all pending/approved leads.
 * Groups leads by provider, creates one PaymentIntent per provider group.
 *
 * Body: { leadIds: string[] }
 * Returns: { results: ProviderResult[], needsSetup?: boolean }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can make payments" }, { status: 403 });
    }

    const body = await request.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds must be a non-empty array" }, { status: 400 });
    }

    if (leadIds.length > 500) {
      return NextResponse.json({ error: "Maximum 500 leads per batch" }, { status: 400 });
    }

    // Validate all leads belong to the buyer and are payable
    const leads = await getLeadsByIds(leadIds);

    if (leads.length !== leadIds.length) {
      return NextResponse.json({ error: "Some leads not found" }, { status: 404 });
    }

    const notOwned = leads.find(l => l.buyer_id !== session.user!.id);
    if (notOwned) {
      return NextResponse.json({ error: "Not all leads belong to you" }, { status: 403 });
    }

    const notPayable = leads.find(l => l.payout_status !== "pending" && l.payout_status !== "approved");
    if (notPayable) {
      return NextResponse.json({ error: "Some leads are already paid or processing" }, { status: 400 });
    }

    const result = await processBatchPayment(session.user.id, leads);

    if (result.error && result.needsSetup) {
      return NextResponse.json({ needsSetup: true, error: result.error }, { status: 200 });
    }

    if (result.error && !result.results.length) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ results: result.results });
  } catch (error: any) {
    console.error("[batch-pay] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Batch payment failed" }, { status: 500 });
  }
}
