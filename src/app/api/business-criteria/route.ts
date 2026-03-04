import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getActiveBusinessCriteria,
  createBusinessCriteria,
  getCriteriaFields,
  setCriteriaFields,
} from '@/lib/db';

// GET — buyer auth, returns active criteria + fields
export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== 'buyer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const criteria = await getActiveBusinessCriteria(session.user.id);
  if (!criteria) {
    return NextResponse.json({ criteria: null, fields: [] });
  }

  const fields = await getCriteriaFields(criteria.id);
  return NextResponse.json({ criteria, fields });
}

// POST — buyer auth, creates/replaces criteria + fields
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'buyer') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { payoutPerLead, weeklyCap, monthlyCap, paymentTiming, terminationNoticeDays, fields } = body;

  if (!payoutPerLead || payoutPerLead <= 0) {
    return NextResponse.json({ error: 'Payout per lead is required and must be positive' }, { status: 400 });
  }

  const criteria = await createBusinessCriteria({
    business_id: session.user.id,
    payout_per_lead: payoutPerLead,
    weekly_cap: weeklyCap || null,
    monthly_cap: monthlyCap || null,
    payment_timing: paymentTiming || null,
    termination_notice_days: terminationNoticeDays ?? null,
  });

  let savedFields: Awaited<ReturnType<typeof setCriteriaFields>> = [];
  if (fields && Array.isArray(fields) && fields.length > 0) {
    savedFields = await setCriteriaFields(criteria.id, fields.map((f: {
      fieldType: string;
      label: string;
      optionA?: string;
      optionB?: string;
      isMandatory: boolean;
      sortOrder: number;
    }, i: number) => ({
      field_type: f.fieldType as 'PHOTO' | 'TEXT' | 'BINARY',
      label: f.label,
      option_a: f.optionA || null,
      option_b: f.optionB || null,
      is_mandatory: f.isMandatory,
      sort_order: f.sortOrder ?? i,
    })));
  }

  return NextResponse.json({ criteria, fields: savedFields });
}
