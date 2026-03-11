/**
 * Sinch SMS utility
 *
 * Sends SMS messages via the Sinch REST API (no SDK dependency — uses native fetch).
 *
 * Required environment variables:
 *   SINCH_SERVICE_PLAN_ID   – found in Sinch Dashboard → SMS → Service Plans
 *   SINCH_API_TOKEN         – found in Sinch Dashboard → SMS → Service Plans → API Token
 *   SINCH_PHONE_NUMBER      – your Sinch virtual number, e.g. +12155550100
 */

const SINCH_BASE_URL = "https://us.sms.api.sinch.com/xms/v1";

export interface SinchSendResult {
  success: boolean;
  batchId?: string;
  error?: string;
}

/**
 * Send an SMS to one or more phone numbers.
 *
 * @param to       E.164-formatted phone number(s), e.g. "+12155550100"
 * @param body     The SMS message body
 */
export async function sendSms(
  to: string | string[],
  body: string
): Promise<SinchSendResult> {
  const servicePlanId = process.env.SINCH_SERVICE_PLAN_ID;
  const apiToken = process.env.SINCH_API_TOKEN;
  const fromNumber = process.env.SINCH_PHONE_NUMBER;

  if (!servicePlanId || !apiToken || !fromNumber) {
    return {
      success: false,
      error: "Sinch SMS is not configured. Please set SINCH_SERVICE_PLAN_ID, SINCH_API_TOKEN, and SINCH_PHONE_NUMBER.",
    };
  }

  const recipients = Array.isArray(to) ? to : [to];

  const url = `${SINCH_BASE_URL}/${servicePlanId}/batches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiToken}`,
    },
    body: JSON.stringify({
      from: fromNumber,
      to: recipients,
      body,
    }),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const json = await res.json();
      detail = json?.text || json?.message || JSON.stringify(json);
    } catch {
      detail = await res.text().catch(() => "");
    }
    return {
      success: false,
      error: `Sinch API error ${res.status}: ${detail}`,
    };
  }

  const data = await res.json();
  return { success: true, batchId: data?.id };
}

/** Returns true if all three Sinch env vars are present. */
export function isSinchConfigured(): boolean {
  return !!(
    process.env.SINCH_SERVICE_PLAN_ID &&
    process.env.SINCH_API_TOKEN &&
    process.env.SINCH_PHONE_NUMBER
  );
}
