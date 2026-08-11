import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { executeSql as sql } from "@/lib/db";
import { normalizePhone } from "@/lib/sinch-voice";

/**
 * Business-configurable verified call destination phone.
 *
 * GET  → returns current verified_call_phone (or null) plus a resolvedSource
 *        so the UI can show "currently routes to X via [criteria|business|account phone]"
 * PUT  → validate + save. Pass { phone: "+16108177845" } or { phone: null } to clear.
 */

async function requireBusiness() {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Authentication required" }, { status: 401 }) };
  }
  if ((session.user as { role?: string }).role !== "buyer") {
    return { error: NextResponse.json({ error: "Only businesses can access this endpoint" }, { status: 403 }) };
  }
  return { userId: session.user.id };
}

export async function GET() {
  const authResult = await requireBusiness();
  if ("error" in authResult) return authResult.error;

  const rows = await sql`
    SELECT verified_call_phone FROM users WHERE id = ${authResult.userId} LIMIT 1
  `;
  const row = rows[0] || {};
  const verifiedCallPhone = row.verified_call_phone as string | null;

  return NextResponse.json({
    success: true,
    verifiedCallPhone,
    // No fallback to account phone by policy. If not set, verified calls will
    // hard-error until the business explicitly configures a number.
    resolved: verifiedCallPhone,
  });
}

export async function PUT(request: NextRequest) {
  const authResult = await requireBusiness();
  if ("error" in authResult) return authResult.error;

  const body = await request.json();

  // Support explicit null to CLEAR the override (fall back to account phone)
  if (body.phone === null) {
    await sql`
      UPDATE users SET verified_call_phone = NULL WHERE id = ${authResult.userId}
    `;
    return NextResponse.json({ success: true, verifiedCallPhone: null });
  }

  if (typeof body.phone !== "string" || !body.phone.trim()) {
    return NextResponse.json(
      { error: "Provide a phone number, or pass phone: null to clear the override." },
      { status: 400 }
    );
  }

  const normalized = normalizePhone(body.phone);
  if (!normalized) {
    return NextResponse.json(
      { error: "That doesn't look like a valid US phone number. Please include area code (10 digits)." },
      { status: 400 }
    );
  }

  await sql`
    UPDATE users SET verified_call_phone = ${normalized} WHERE id = ${authResult.userId}
  `;

  return NextResponse.json({ success: true, verifiedCallPhone: normalized });
}
