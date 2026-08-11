import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getConnectionById,
  getUserById,
  createCallSession,
  updateCallSession,
  getActiveBusinessCriteria,
  getCriteriaById,
} from '@/lib/db';
import { initiateConferenceLeg, normalizePhone } from '@/lib/sinch-voice';

/**
 * POST /api/sinch-voice/initiate
 * Provider-authenticated. Initiates a verified conference call between
 * the provider and the business. Sinch calls both phones and bridges them.
 * Returns a callSessionId that the provider polls until verified.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    if ((session.user as { role?: string }).role !== 'provider') {
      return NextResponse.json({ error: 'Only providers can initiate verified calls' }, { status: 403 });
    }

    const body = await request.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId is required' }, { status: 400 });
    }

    // Validate the connection belongs to this provider
    const connection = await getConnectionById(connectionId);
    if (!connection || connection.provider_id !== session.user.id) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
    }
    if (connection.status !== 'active') {
      return NextResponse.json({ error: 'Connection must be active' }, { status: 400 });
    }

    // Get provider's phone number
    const provider = await getUserById(session.user.id);
    if (!provider) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }
    if (!provider.phone) {
      return NextResponse.json({
        error: 'You must add a phone number to your profile before making a verified call.',
      }, { status: 400 });
    }
    const providerPhone = normalizePhone(provider.phone);
    if (!providerPhone) {
      return NextResponse.json({
        error: 'Your phone number is invalid. Please update it in your profile.',
      }, { status: 400 });
    }

    // Get buyer's business record.
    const buyer = await getUserById(connection.buyer_id);
    if (!buyer) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 });
    }

    // Resolve which phone Sinch should dial.
    // Priority chain (NO fallback to users.phone — see below):
    //   1. criteria.call_phone_number   — per-deal override (Lead Criteria)
    //   2. buyer.verified_call_phone    — business-level default (Settings tab)
    //   3. hard error                    — force business to set an explicit number
    //
    // Why no users.phone fallback: users.phone is the business owner's account/SMS
    // phone (often a personal cell). Silently routing verified calls to it produced
    // real-world incidents where providers reached a personal voicemail instead of
    // the business. Every business must intentionally configure a dedicated
    // verified-call number — no defaults, no reversion.
    const criteria = connection.criteria_id
      ? await getCriteriaById(connection.criteria_id)
      : await getActiveBusinessCriteria(connection.buyer_id);
    const buyerVerifiedCallPhone = (buyer as { verified_call_phone?: string | null }).verified_call_phone || null;
    const rawBuyerPhone = criteria?.call_phone_number || buyerVerifiedCallPhone;

    if (!rawBuyerPhone) {
      return NextResponse.json({
        error: 'The business has not configured a verified-call number yet. Ask them to set one in Settings → Verified Call Routing.',
      }, { status: 400 });
    }
    const buyerPhone = normalizePhone(rawBuyerPhone);
    if (!buyerPhone) {
      return NextResponse.json({
        error: 'The business verified-call number is invalid. Ask them to update it in Settings → Verified Call Routing.',
      }, { status: 400 });
    }

    // Create call session record
    const callSession = await createCallSession({
      provider_id: session.user.id,
      buyer_id: connection.buyer_id,
      connection_id: connectionId,
    });

    const webhookUrl = `${process.env.NEXTAUTH_URL || 'https://womleads.com'}/api/sinch-voice/webhook`;
    const businessName = buyer.business_name || buyer.display_name || 'the business';

    // Initiate conference leg for provider
    let providerCallId: string | null = null;
    let buyerCallId: string | null = null;

    try {
      const providerResult = await initiateConferenceLeg({
        conferenceId: callSession.id,
        destinationPhone: providerPhone,
        greeting: `You are now connected to a WOML verified lead call with ${businessName}. Please stay on the line.`,
        callbackUrl: webhookUrl,
      });
      providerCallId = providerResult.callId;
    } catch (err) {
      console.error('[sinch-voice/initiate] Provider call failed:', err);
      await updateCallSession(callSession.id, { status: 'failed' });
      return NextResponse.json({
        error: 'Failed to initiate call to your phone. Please check your phone number in your profile.',
      }, { status: 500 });
    }

    // Initiate conference leg for buyer (small delay so provider can answer first)
    await new Promise(resolve => setTimeout(resolve, 3000));

    try {
      const buyerResult = await initiateConferenceLeg({
        conferenceId: callSession.id,
        destinationPhone: buyerPhone,
        greeting: `You have an incoming WOML verified lead call from a provider. Please stay on the line.`,
        callbackUrl: webhookUrl,
      });
      buyerCallId = buyerResult.callId;
    } catch (err) {
      // If buyer call fails, provider call still running — not fatal
      console.error('[sinch-voice/initiate] Buyer call failed:', err);
    }

    // Save both call IDs to the session
    await updateCallSession(callSession.id, {
      sinch_call_id_provider: providerCallId,
      sinch_call_id_buyer: buyerCallId,
      status: 'in_progress',
    });

    return NextResponse.json({
      success: true,
      callSessionId: callSession.id,
      message: `Calling you at ${provider.phone}. Answer the call and speak with ${businessName} for at least 30 seconds.`,
    });
  } catch (err) {
    console.error('[sinch-voice/initiate] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
