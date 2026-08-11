import { NextRequest, NextResponse } from 'next/server';
import { getCallSessionBySinchId, updateCallSession } from '@/lib/db';
import { MIN_CALL_DURATION } from '@/lib/sinch-voice';

/**
 * POST /api/sinch-voice/webhook
 * Receives Sinch Voice events (DiCE) for verified call sessions.
 * No authentication — Sinch calls this URL directly.
 *
 * VERIFICATION RULES (per-leg — anti-farming):
 * A session is marked `verified = true` ONLY when ALL of these are true:
 *   1. provider leg reported ANSWERED
 *   2. provider leg duration >= MIN_CALL_DURATION
 *   3. buyer leg reported ANSWERED
 *   4. buyer leg duration >= MIN_CALL_DURATION
 *
 * Prior rule (single-leg duration check) let a provider hold their own line
 * for 30 seconds while the buyer leg never picked up — verified fired anyway
 * because ANY DiCE crossing the threshold was enough. That farming vector is
 * closed here.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const event = (body.event as string | undefined)?.toLowerCase();

    if (event !== 'dice') {
      // Only care about disconnect events
      return NextResponse.json({});
    }

    const callId: string | undefined = body.callId || body.callid;
    const duration: number = typeof body.duration === 'number' ? body.duration : 0;
    const result: string = body.result || '';

    if (!callId) {
      console.warn('[sinch-voice/webhook] DiCE event missing callId');
      return NextResponse.json({});
    }

    const callSession = await getCallSessionBySinchId(callId);
    if (!callSession) {
      console.warn('[sinch-voice/webhook] No call session found for callId:', callId);
      return NextResponse.json({});
    }

    // Idempotency: don't reprocess if already verified
    if (callSession.verified) {
      return NextResponse.json({});
    }

    // Figure out which LEG this DiCE event belongs to
    const answered = result === 'ANSWERED' || result === 'answered';
    const isProviderLeg = callSession.sinch_call_id_provider === callId;
    const isBuyerLeg = callSession.sinch_call_id_buyer === callId;

    if (!isProviderLeg && !isBuyerLeg) {
      console.warn(`[sinch-voice/webhook] callId ${callId} matched session ${callSession.id} but neither provider nor buyer leg id — ignoring`);
      return NextResponse.json({});
    }

    // Merge this leg's results with whatever we already have from the other leg
    const providerAnswered = isProviderLeg ? answered : (callSession as any).provider_answered ?? null;
    const providerDuration = isProviderLeg ? duration : (callSession as any).provider_duration_seconds ?? null;
    const buyerAnswered    = isBuyerLeg    ? answered : (callSession as any).buyer_answered ?? null;
    const buyerDuration    = isBuyerLeg    ? duration : (callSession as any).buyer_duration_seconds ?? null;

    // Verify only if BOTH legs answered AND BOTH met the duration threshold.
    // If either leg hasn't reported yet (null), we can't verify — we may on the
    // next DiCE event for the other leg.
    const bothAnswered = providerAnswered === true && buyerAnswered === true;
    const bothMetDuration =
      typeof providerDuration === 'number' && providerDuration >= MIN_CALL_DURATION &&
      typeof buyerDuration === 'number'    && buyerDuration    >= MIN_CALL_DURATION;
    const isVerified = bothAnswered && bothMetDuration;

    // For the top-level duration_seconds field (used in dashboards / audits),
    // store the max of the two leg durations — the longer party's engagement.
    const summaryDuration = Math.max(
      typeof providerDuration === 'number' ? providerDuration : 0,
      typeof buyerDuration    === 'number' ? buyerDuration    : 0,
    );

    // Only mark 'completed' once both legs have reported; otherwise 'in_progress'
    const bothLegsReported =
      typeof providerDuration === 'number' && typeof buyerDuration === 'number';

    await updateCallSession(callSession.id, {
      status: bothLegsReported ? 'completed' : 'in_progress',
      duration_seconds: summaryDuration,
      completed_at: bothLegsReported ? new Date().toISOString() : null,
      verified: isVerified,
      provider_answered:         providerAnswered,
      provider_duration_seconds: providerDuration,
      buyer_answered:            buyerAnswered,
      buyer_duration_seconds:    buyerDuration,
    } as any);

    console.log(`[sinch-voice/webhook] session=${callSession.id} leg=${isProviderLeg ? 'provider' : 'buyer'} answered=${answered} duration=${duration}s | now: prov(ans=${providerAnswered}, dur=${providerDuration}s) buyer(ans=${buyerAnswered}, dur=${buyerDuration}s) verified=${isVerified}`);

    return NextResponse.json({});
  } catch (err) {
    console.error('[sinch-voice/webhook] Error processing event:', err);
    // Always return 200 so Sinch doesn't retry — errors are our problem, not theirs
    return NextResponse.json({});
  }
}
