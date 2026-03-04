import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBusinessCriteriaWithFields, getConnectionByProviderAndBuyer } from '@/lib/db';

// GET — provider auth (must have connection to this business)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ businessId: string }> }
) {
  const session = await auth();
  if (!session?.user || session.user.role !== 'provider') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { businessId } = await params;

  // Verify provider has a connection to this business
  const connection = await getConnectionByProviderAndBuyer(session.user.id, businessId);
  if (!connection) {
    return NextResponse.json({ error: 'No connection to this business' }, { status: 403 });
  }

  const result = await getBusinessCriteriaWithFields(businessId);
  if (!result) {
    return NextResponse.json({ criteria: null, fields: [] });
  }

  return NextResponse.json({ criteria: result.criteria, fields: result.fields });
}
