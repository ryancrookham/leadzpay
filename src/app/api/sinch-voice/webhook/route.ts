import { NextRequest, NextResponse } from 'next/server';
import { getCallSessionBySinchId, updateCallSession } from '@/lib/db';
import { MIN_CALL_DURATION } from '@/lib/sinch-voice';

/**
 * POST /api/sinch-voice/webhook
 * Receives Sinch Voice events (ACE, DiCE) for verified call sessions.
 * No authentication — Sinch calls this URL directly.
 *
 * On DiCE (Disconnect Call Event): updates the call session with duration
 * and marks it as verified if duration >= MIN_CALL_DURATION.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = (body.event as string | undefined)?.toLowerCase();

    // Only care about disconnect events
    if (event !== 'dice') {
      // For non-DiCE events, acknowledge with empty 200
      return NextResponse.json({});
    }

    const callId: string | undefined = body.callId || body.callid;
    const duration: number = typeof body.duration === 'number' ? body.duration : 0;
    const result: string = body.result || '';

    if (!callId) {
      console.warn('[sinch-voice/webhook] DiCE event missing callId');
      return NextResponse.json({});
    }

    // Look up the call session by this Sinch call ID
    const callSession = await getCallSessionBySinchId(callId);
    if (!callSession) {
      // Unknown call — may be a stale or unrelated event
      console.warn('[sinch-voice/webhook] No call session found for callId:', callId);
      return NextResponse.json({});
    }

    // Already verified — no need to reprocess
    if (callSession.verified) {
      return NextResponse.json({});
    }

    const wasAnswered = result === 'ANSWERED' || result === 'answered';
    const metDurationThreshold = duration >= MIN_CALL_DURATION;
    const isVerified = wasAnswered && metDurationThreshold;

    await updateCallSession(callSession.id, {
      status: 'completed',
      duration_seconds: duration,
      completed_at: new Date().toISOString(),
      verified: isVerified,
    });

    console.log(`[sinch-voice/webhook] Session ${callSession.id}: duration=${duration}s, verified=${isVerified}`);

    return NextResponse.json({});
  } catch (err) {
    console.error('[sinch-voice/webhook] Error processing event:', err);
    // Return 200 to prevent Sinch from retrying
    return NextResponse.json({});
  }
}
