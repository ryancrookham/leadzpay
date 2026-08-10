import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { initiateConferenceLeg, normalizePhone } from "@/lib/sinch-voice";
import { randomUUID } from "crypto";

/**
 * Trigger a test Sinch call to a given phone number so the business owner
 * can confirm the number rings the right device BEFORE saving it as their
 * verified-call routing target.
 *
 * Does NOT create a call_sessions record — this is purely for UX validation.
 * Sinch will call the number, play a short greeting, and hang up when the
 * user hangs up. No conference (single leg).
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  if ((session.user as { role?: string }).role !== "buyer") {
    return NextResponse.json({ error: "Only businesses can send test calls" }, { status: 403 });
  }

  const body = await request.json();
  const phone = typeof body.phone === "string" ? body.phone : "";
  if (!phone.trim()) {
    return NextResponse.json({ error: "Phone number is required" }, { status: 400 });
  }

  const normalized = normalizePhone(phone);
  if (!normalized) {
    return NextResponse.json(
      { error: "Invalid phone number. Include area code (10 digits)." },
      { status: 400 }
    );
  }

  const webhookUrl = `${process.env.NEXTAUTH_URL || "https://womleads.com"}/api/sinch-voice/webhook`;

  try {
    const { callId } = await initiateConferenceLeg({
      // Unique per-test conferenceId so it doesn't accidentally bridge with any live session
      conferenceId: `test-${randomUUID()}`,
      destinationPhone: normalized,
      greeting:
        "This is a WOML verified-call test. If you can hear this, your call routing is working. You can hang up now.",
      callbackUrl: webhookUrl,
    });

    return NextResponse.json({
      success: true,
      callId,
      message: `Test call placed to ${normalized}. It should ring within 5-10 seconds.`,
    });
  } catch (err) {
    console.error("[verified-call-phone/test] Sinch call failed:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `Test call failed: ${msg}` },
      { status: 500 }
    );
  }
}
