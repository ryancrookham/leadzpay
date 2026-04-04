import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getLeadsByIds,
  getUserById,
  updateUserStripeCustomer,
  getPlatformSettings,
  getProvidersByIds,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

/**
 * POST /api/stripe/create-payment
 * Create a Stripe Checkout Session using destination charges.
 *
 * With destination charges:
 *   - Buyer pays the lead face value (no markup)
 *   - Stripe routes payment directly to the provider's connected account
 *   - WOML collects application_fee_amount (12.5% of lead value) automatically
 *   - No settlement delay — provider is paid instantly when buyer pays
 *
 * Body: { leadIds: string[] }
 * Returns: { url: string }
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

    // Destination charges require a single provider destination per checkout session.
    // The business dashboard already groups leads by provider before calling this endpoint.
    const providerIdSet = new Set(leads.map(l => l.provider_id));
    if (providerIdSet.size > 1) {
      return NextResponse.json(
        { error: "All leads in a payment must be from the same provider. Please pay each provider group separately." },
        { status: 400 }
      );
    }

    const providerId = leads[0].provider_id;
    const providers = await getProvidersByIds([providerId]);
    const provider = providers[0];

    if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
      return NextResponse.json(
        { error: "This provider has not completed Stripe Connect onboarding. They must set up their payout account before you can pay them." },
        { status: 400 }
      );
    }

    // Calculate amounts using current fee settings
    const platformFees = await getPlatformSettings();
    let totalCents = 0;          // What the buyer pays (face value of leads)
    let applicationFeeCents = 0; // WOML's cut (12.5%) — deducted from provider payout

    for (const lead of leads) {
      const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
      totalCents += Math.round(breakdown.buyerTotal * 100);
      applicationFeeCents += Math.round(breakdown.totalPlatformFee * 100);
    }

    // Get or create Stripe Customer for the buyer
    const buyer = await getUserById(session.user.id);
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = buyer.stripe_customer_id;

    // Validate existing customer ID (test-mode IDs don't exist in live mode)
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

    // Create Checkout Session using destination charges.
    // application_fee_amount = WOML's cut, automatically collected by Stripe.
    // transfer_data.destination = provider's connected Stripe account.
    // Stripe routes the remainder directly to the provider — no manual transfer step needed.
    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "payment",
      payment_intent_data: {
        application_fee_amount: applicationFeeCents,
        transfer_data: {
          destination: provider.stripe_account_id,
        },
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `WOML Lead Payment (${leads.length} lead${leads.length > 1 ? "s" : ""})`,
              description: `Payment for ${leads.length} lead${leads.length > 1 ? "s" : ""} submitted by ${provider.display_name || provider.username || "provider"}`,
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        lead_ids: leadIds.join(","),
        buyer_id: session.user.id,
        provider_id: providerId,
        lead_count: String(leads.length),
      },
      success_url: `${appUrl}/business?tab=leads&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/business?tab=leads&payment=cancelled`,
    });

    return NextResponse.json({ url: checkoutSession.url });
  } catch (error: any) {
    console.error("[create-payment] error:", error?.message);
    const message = error?.message || "Failed to create payment session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
