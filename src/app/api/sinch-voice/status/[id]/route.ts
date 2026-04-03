import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getCallSession } from '@/lib/db';

/**
 * GET /api/sinch-voice/status/[id]
 * Provider-authenticated. Returns the current status of a call session.
 * Used by the frontend to poll until the call is verified.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const callSession = await getCallSession(id);

    if (!callSession) {
      return NextResponse.json({ error: 'Call session not found' }, { status: 404 });
    }

    // Verify this session belongs to the requesting provider
    if (callSession.provider_id !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    return NextResponse.json({
      id: callSession.id,
      status: callSession.status,
      verified: callSession.verified,
      duration_seconds: callSession.duration_seconds,
    });
  } catch (err) {
    console.error('[sinch-voice/status] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
