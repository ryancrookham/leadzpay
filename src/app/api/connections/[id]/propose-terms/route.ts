import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getConnectionById, createTermProposal, rescindTermProposal, getPendingProposal, getUserById } from "@/lib/db";
import { sendSms, isSinchConfigured } from "@/lib/sinch";

// POST /api/connections/[id]/propose-terms — Business proposes new terms
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Buyer authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (connection.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Not your connection" }, { status: 403 });
    }
    if (connection.status !== "active") {
      return NextResponse.json({ error: "Connection must be active to propose terms" }, { status: 400 });
    }

    const body = await request.json();
    const {
      payoutPerLead,
      weeklyCap,
      monthlyCap,
      paymentTiming,
      terminationNoticeDays,
      requireVerifiedCall,
      callPhoneNumber,
      fields,
    } = body;

    if (!payoutPerLead || payoutPerLead <= 0) {
      return NextResponse.json({ error: "Payout per lead must be positive" }, { status: 400 });
    }

    const result = await createTermProposal({
      connectionId: id,
      proposedBy: session.user.id,
      criteria: {
        business_id: connection.buyer_id,
        payout_per_lead: payoutPerLead,
        weekly_cap: weeklyCap ?? null,
        monthly_cap: monthlyCap ?? null,
        payment_timing: paymentTiming ?? null,
        termination_notice_days: terminationNoticeDays ?? null,
        require_verified_call: requireVerifiedCall ?? false,
        call_phone_number: callPhoneNumber ?? null,
      },
      fields: (fields || []).map((f: any, i: number) => ({
        field_type: f.fieldType || f.field_type,
        label: f.label,
        option_a: f.optionA || f.option_a || null,
        option_b: f.optionB || f.option_b || null,
        is_mandatory: f.isMandatory ?? f.is_mandatory ?? true,
        sort_order: f.sortOrder ?? f.sort_order ?? i,
      })),
    });

    // Send SMS to provider (non-blocking)
    try {
      if (isSinchConfigured()) {
        const provider = await getUserById(connection.provider_id);
        const buyer = await getUserById(connection.buyer_id);
        const businessName = buyer?.business_name || buyer?.display_name || "Your business partner";
        if (provider?.phone) {
          await sendSms(provider.phone, `${businessName} has proposed updated lead terms. Review and respond at womleads.com`);
        }
      }
    } catch (smsErr) {
      console.error("[PROPOSE-TERMS] SMS send failed:", smsErr);
    }

    return NextResponse.json({
      success: true,
      proposalId: result.proposal.id,
      proposedCriteria: result.criteria,
      fields: result.fields,
    });
  } catch (error) {
    console.error("[PROPOSE-TERMS] Error:", error);
    return NextResponse.json({ error: "Failed to propose terms" }, { status: 500 });
  }
}

// DELETE /api/connections/[id]/propose-terms — Rescind pending proposal
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Buyer authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const connection = await getConnectionById(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (connection.buyer_id !== session.user.id) {
      return NextResponse.json({ error: "Not your connection" }, { status: 403 });
    }

    const pending = await getPendingProposal(id);
    if (!pending) {
      return NextResponse.json({ error: "No pending proposal to rescind" }, { status: 404 });
    }

    await rescindTermProposal(pending.id, session.user.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PROPOSE-TERMS] Rescind error:", error);
    return NextResponse.json({ error: "Failed to rescind proposal" }, { status: 500 });
  }
}
