import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  updateBusinessCriteria,
  getCriteriaFields,
  setCriteriaFields,
  terminateDeal,
} from '@/lib/db';

// PATCH — buyer auth, update criteria + fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'buyer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { payoutPerLead, weeklyCap, monthlyCap, paymentTiming, terminationNoticeDays, fields, requireVerifiedCall, callPhoneNumber } = body;

  const updates: { payout_per_lead?: number; weekly_cap?: number | null; monthly_cap?: number | null; payment_timing?: string | null; termination_notice_days?: number | null; require_verified_call?: boolean; call_phone_number?: string | null } = {};
  if (payoutPerLead !== undefined) updates.payout_per_lead = payoutPerLead;
  if (weeklyCap !== undefined) updates.weekly_cap = weeklyCap || null;
  if (monthlyCap !== undefined) updates.monthly_cap = monthlyCap || null;
  if (paymentTiming !== undefined) updates.payment_timing = paymentTiming || null;
  if (terminationNoticeDays !== undefined) updates.termination_notice_days = terminationNoticeDays ?? null;
  if (requireVerifiedCall !== undefined) updates.require_verified_call = requireVerifiedCall;
  if (callPhoneNumber !== undefined) updates.call_phone_number = callPhoneNumber || null;

  const criteria = await updateBusinessCriteria(id, session.user.id, updates);
  if (!criteria) {
    return NextResponse.json({ error: 'Criteria not found' }, { status: 404 });
  }

  let savedFields: Awaited<ReturnType<typeof getCriteriaFields>>;
  if (fields && Array.isArray(fields)) {
    savedFields = await setCriteriaFields(criteria.id, fields.map((f: {
      fieldType: string;
      label: string;
      optionA?: string;
      optionB?: string;
      isMandatory: boolean;
      sortOrder: number;
    }, i: number) => ({
      field_type: f.fieldType as 'PHOTO' | 'TEXT' | 'BINARY' | 'PHONE_CALL',
      label: f.label,
      option_a: f.optionA || null,
      option_b: f.optionB || null,
      is_mandatory: f.isMandatory,
      sort_order: f.sortOrder ?? i,
    })));
  } else {
    savedFields = await getCriteriaFields(criteria.id);
  }

  return NextResponse.json({ criteria, fields: savedFields });
}

// DELETE — buyer auth, Terminate Deal
export async function DELETE() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'buyer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await terminateDeal(session.user.id);
  return NextResponse.json({
    success: true,
    connectionsTerminated: result.connectionsTerminated,
    payoutsFlagged: result.payoutsFlagged,
  });
}
