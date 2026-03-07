import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserById, updateUserStripeCustomer } from "@/lib/db";
import { stripe } from "@/lib/stripe";

const APP_URL = process.env.NEXTAUTH_URL || "https://www.womleads.com";

// POST /api/stripe/setup-customer — create Stripe Customer + setup session for bank/card
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can set up payment methods" }, { status: 403 });
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Create or retrieve Stripe Customer
    let customerId = user.stripe_customer_id;

    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null; // Customer doesn't exist (test/live mode mismatch)
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.business_name || user.display_name || user.username,
        metadata: { woml_user_id: user.id },
      });
      customerId = customer.id;
      await updateUserStripeCustomer(user.id, customerId);
    }

    // Create Checkout Session in setup mode to collect payment method
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      payment_method_types: ["card", "us_bank_account"],
      success_url: `${APP_URL}/business?tab=settings&stripe=success`,
      cancel_url: `${APP_URL}/business?tab=settings&stripe=cancel`,
    });

    return NextResponse.json({ setupUrl: checkoutSession.url });
  } catch (error) {
    console.error("[SETUP-CUSTOMER] POST error:", error);
    return NextResponse.json({ error: "Failed to set up payment method" }, { status: 500 });
  }
}
