import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserForDeletion, hardDeleteUser } from "@/lib/db";
import { stripe } from "@/lib/stripe";

/**
 * POST /api/admin/hard-delete-user
 *
 * Permanently deletes a user account including:
 *   - All WOML database records (leads, connections, invite tokens, etc.)
 *   - Their Stripe Express account (providers) or Stripe Customer (buyers)
 *
 * ADMIN ONLY. Irreversible. Intended for pre-launch test-account cleanup.
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Auth check — admin only
    const session = await auth();
    if (!session?.user?.id || (session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { userId } = await request.json();
    if (!userId || typeof userId !== "string") {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // 2. Prevent self-deletion
    if (userId === session.user.id) {
      return NextResponse.json({ error: "Cannot delete your own admin account" }, { status: 400 });
    }

    // 3. Fetch user record to get Stripe IDs before we nuke the DB row
    const user = await getUserForDeletion(userId);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // 4. Delete Stripe resources (best-effort — never block DB deletion)
    const stripeWarnings: string[] = [];

    if (user.stripe_account_id) {
      // Provider — delete their Express connected account
      try {
        await stripe.accounts.del(user.stripe_account_id);
        console.log(`[ADMIN HARD DELETE] Deleted Stripe Connect account: ${user.stripe_account_id} for user ${userId}`);
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`[ADMIN HARD DELETE] Failed to delete Stripe account ${user.stripe_account_id}:`, msg);
        stripeWarnings.push(`Stripe Connect account ${user.stripe_account_id} could not be deleted: ${msg}`);
      }
    }

    if (user.stripe_customer_id) {
      // Buyer — delete their Stripe Customer record
      try {
        await stripe.customers.del(user.stripe_customer_id);
        console.log(`[ADMIN HARD DELETE] Deleted Stripe customer: ${user.stripe_customer_id} for user ${userId}`);
      } catch (stripeErr) {
        const msg = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error(`[ADMIN HARD DELETE] Failed to delete Stripe customer ${user.stripe_customer_id}:`, msg);
        stripeWarnings.push(`Stripe customer ${user.stripe_customer_id} could not be deleted: ${msg}`);
      }
    }

    // 5. Hard delete from database (cascades through all related tables)
    await hardDeleteUser(userId);
    console.log(`[ADMIN HARD DELETE] Successfully deleted user ${userId} (${user.email})`);

    return NextResponse.json({
      success: true,
      deletedUser: { id: userId, email: user.email, role: user.role },
      stripeWarning: stripeWarnings.length > 0 ? stripeWarnings.join("; ") : undefined,
    });
  } catch (error) {
    console.error("[ADMIN HARD DELETE] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete user";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
