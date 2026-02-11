import { NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { getUserById, updateUser } from "@/lib/db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, { apiVersion: "2026-01-28.clover" });
}

/**
 * POST /api/stripe/setup-customer - Create Stripe Customer + SetupIntent for business
 * Returns clientSecret for Stripe Elements to add a payment method
 */
export async function POST() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can set up payment methods" }, { status: 403 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({
        success: true,
        simulated: true,
        message: "Stripe not configured. Add STRIPE_SECRET_KEY to enable payments.",
      });
    }

    const user = await getUserById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = (user as any).stripe_customer_id;

    // Create Stripe Customer if not exists
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.business_name || user.display_name || user.username,
        metadata: { userId: user.id, role: "buyer" },
      });
      customerId = customer.id;
      await updateUser(user.id, { stripe_customer_id: customerId } as any);
    }

    // Create SetupIntent for adding payment method
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      metadata: { userId: user.id },
    });

    return NextResponse.json({
      success: true,
      clientSecret: setupIntent.client_secret,
      customerId,
    });
  } catch (error) {
    console.error("Stripe setup-customer error:", error);
    return NextResponse.json({ success: false, error: "Failed to set up payment" }, { status: 500 });
  }
}

/**
 * GET /api/stripe/setup-customer - Get saved payment methods for business
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json({ hasPaymentMethod: false, stripeConfigured: false });
    }

    const user = await getUserById(session.user.id);
    const customerId = (user as any)?.stripe_customer_id;

    if (!customerId) {
      return NextResponse.json({ hasPaymentMethod: false, stripeConfigured: true });
    }

    const paymentMethods = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
    });

    const cards = paymentMethods.data.map((pm) => ({
      id: pm.id,
      brand: pm.card?.brand,
      last4: pm.card?.last4,
      expMonth: pm.card?.exp_month,
      expYear: pm.card?.exp_year,
    }));

    return NextResponse.json({
      hasPaymentMethod: cards.length > 0,
      stripeConfigured: true,
      customerId,
      cards,
    });
  } catch (error) {
    console.error("Get payment methods error:", error);
    return NextResponse.json({ error: "Failed to get payment methods" }, { status: 500 });
  }
}
