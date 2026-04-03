/**
 * Sinch Voice API client for WOML verified call feature.
 * Uses Sinch REST Calling API (conference callout) to bridge
 * providers and businesses for lead verification.
 */

const SINCH_BASE_URL = 'https://calling.api.sinch.com/calling/v1';
export const MIN_CALL_DURATION = parseInt(process.env.SINCH_VOICE_MIN_DURATION || '30', 10);

function getSinchAuth(): string {
  const appKey = process.env.SINCH_APP_KEY;
  const appSecret = process.env.SINCH_APP_SECRET;
  if (!appKey || !appSecret) {
    throw new Error('SINCH_APP_KEY and SINCH_APP_SECRET must be set');
  }
  return 'Basic ' + Buffer.from(`${appKey}:${appSecret}`).toString('base64');
}

export function getSinchAppKey(): string {
  return process.env.SINCH_APP_KEY || '';
}

/**
 * Initiates a conference callout leg to one participant.
 * Call this twice (once for provider, once for buyer) with the same
 * conferenceId to bridge them together.
 */
export async function initiateConferenceLeg(params: {
  conferenceId: string;
  destinationPhone: string;
  greeting: string;
  callbackUrl: string;
}): Promise<{ callId: string }> {
  const auth = getSinchAuth();
  const cli = process.env.SINCH_VOICE_NUMBER || '+16108178629';

  const body = {
    method: 'conferenceCallout',
    conferenceCallout: {
      conferenceId: params.conferenceId,
      cli,
      destination: {
        type: 'number',
        endpoint: params.destinationPhone,
      },
      greeting: params.greeting,
      enableDice: true,
      enableAce: false,
      callbackUrl: params.callbackUrl,
    },
  };

  const response = await fetch(`${SINCH_BASE_URL}/callouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: auth,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Sinch callout failed: ${response.status} ${errText}`);
  }

  const data = await response.json();
  // Sinch returns { callId: "..." } for conference callouts
  return { callId: data.callId as string };
}

/**
 * Normalizes a phone number to E.164 format (+1XXXXXXXXXX for US).
 * Returns null if the number cannot be normalized.
 */
export function normalizePhone(phone: string): string | null {
  // Strip all non-numeric characters
  const digits = phone.replace(/\D/g, '');

  // US number: 10 digits → +1XXXXXXXXXX
  if (digits.length === 10) {
    return `+1${digits}`;
  }

  // US number with country code: 11 digits starting with 1 → +1XXXXXXXXXX
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  // Already E.164 style (12+ digits)
  if (digits.length >= 11) {
    return `+${digits}`;
  }

  return null;
}
