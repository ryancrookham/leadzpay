import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * GET /api/account/close
 * Check whether the business has any unpaid leads outstanding.
 * Returns { success: true, unpaidLeads: number }
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only business accounts can close accounts" }, { status: 403 });
    }

    const sql = getDb();
    const result = await sql`
      SELECT COUNT(*)::int AS unpaid
      FROM leads
      WHERE buyer_id = ${session.user.id}
        AND payout_status IN ('pending', 'processing')
    `;
    const unpaidLeads = (result[0] as { unpaid: number }).unpaid ?? 0;

    return NextResponse.json({ success: true, unpaidLeads });
  } catch (error) {
    console.error("[ACCOUNT CLOSE] GET error:", error);
    return NextResponse.json({ error: "Failed to check account status" }, { status: 500 });
  }
}

/**
 * POST /api/account/close
 * Close the business account if all leads are paid.
 * - Deactivates all invite tokens
 * - Terminates all active connections
 * - Marks account as closed (is_active = false)
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only business accounts can close accounts" }, { status: 403 });
    }

    const sql = getDb();
    const buyerId = session.user.id;

    // Final unpaid check — must be zero to proceed
    const check = await sql`
      SELECT COUNT(*)::int AS unpaid
      FROM leads
      WHERE buyer_id = ${buyerId}
        AND payout_status IN ('pending', 'processing')
    `;
    const unpaidLeads = (check[0] as { unpaid: number }).unpaid ?? 0;
    if (unpaidLeads > 0) {
      return NextResponse.json(
        {
          error: `You have ${unpaidLeads} unpaid lead${unpaidLeads !== 1 ? "s" : ""}. Complete all payments before closing.`,
          unpaidLeads,
        },
        { status: 400 }
      );
    }

    // 1. Deactivate all invite tokens for this business
    await sql`
      UPDATE invite_tokens
      SET is_active = false
      WHERE buyer_id = ${buyerId} AND is_active = true
    `;

    // 2. Terminate all active/pending connections
    await sql`
      UPDATE connections
      SET status = 'terminated'
      WHERE buyer_id = ${buyerId}
        AND status IN ('active', 'pending', 'terms_set')
    `;

    // 3. Mark account as closed
    await sql`
      UPDATE users
      SET is_active = false
      WHERE id = ${buyerId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ACCOUNT CLOSE] POST error:", error);
    return NextResponse.json(
      { error: "Account closure failed. Please contact womleads@outlook.com." },
      { status: 500 }
    );
  }
}
