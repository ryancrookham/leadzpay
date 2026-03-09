import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { getLeadsByIds, getUserById, updateUserStripeCustomer, getPlatformSettings } from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

/**
 * POST /api/stripe/create-payment
 * Create a Stripe Checkout Session for a batch of leads.
 * Body: { leadIds: string[] }
 * Returns: { url: string } — the Checkout URL to redirect the buyer to.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can make payments" }, { status: 403 });
    }

    const body = await request.json();
    const { leadIds } = body;

    if (!Array.isArray(leadIds) || leadIds.length === 0) {
      return NextResponse.json({ error: "leadIds must be a non-empty array" }, { status: 400 });
    }

    if (leadIds.length > 500) {
      return NextResponse.json({ error: "Maximum 500 leads per batch" }, { status: 400 });
    }

    // Validate all leads belong to the buyer and are pending
    const leads = await getLeadsByIds(leadIds);

    if (leads.length !== leadIds.length) {
      return NextResponse.json({ error: "Some leads not found" }, { status: 404 });
    }

    const notOwned = leads.find(l => l.buyer_id !== session.user!.id);
    if (notOwned) {
      return NextResponse.json({ error: "Not all leads belong to you" }, { status: 403 });
    }

    const notPending = leads.find(l => l.payout_status !== "pending");
    if (notPending) {
      return NextResponse.json({ error: "Some leads are already paid or processing" }, { status: 400 });
    }

    // Calculate total from fee breakdown
    const platformFees = await getPlatformSettings();
    let totalCents = 0;
    for (const lead of leads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
      totalCents += Math.round(breakdown.buyerTotal * 100);
    }

    // Get or create Stripe Customer for the buyer
    const buyer = await getUserById(session.user.id);
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = buyer.stripe_customer_id;

    // If a customer ID exists but was created in test mode, it won't exist in live mode.
    // Verify it's valid; if not, fall through to create a new one.
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch {
        customerId = null;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: buyer.email,
        name: buyer.business_name || buyer.display_name || buyer.username,
        metadata: { woml_user_id: buyer.id },
      });
      customerId = customer.id;
      await updateUserStripeCustomer(buyer.id, customerId);
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://womleads.com";

    // Create Checkout Session
    // Dynamic payment methods enabled in Stripe Dashboard - no hardcoded types
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `WOML Lead Payment (${leads.length} lead${leads.length > 1 ? "s" : ""})`,
              description: `Payment for ${leads.length} lead${leads.length > 1 ? "s" : ""} on WOML`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        lead_ids: leadIds.join(","),
        buyer_id: session.user.id,
        lead_count: String(leads.length),
      },
      success_url: `${appUrl}/business?tab=leads&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/business?tab=leads&payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("[create-payment] error type:", error?.type);
    console.error("[create-payment] error code:", error?.code);
    console.error("[create-payment] error detail:", error?.detail);
    console.error("[create-payment] error message:", error?.message);
    const message = error?.message || "Failed to create payment session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
