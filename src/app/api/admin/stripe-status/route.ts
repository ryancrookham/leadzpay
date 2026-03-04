import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";

// GET /api/admin/stripe-status — platform Stripe account status
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Retrieve platform account (no ID = own account)
    const account = await stripe.accounts.retrieve();

    return NextResponse.json({
      success: true,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      businessName: account.business_profile?.name || null,
      email: account.email || null,
    });
  } catch (error) {
    console.error("[ADMIN-STRIPE-STATUS] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch Stripe status" }, { status: 500 });
  }
}
