import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getLeadsByIds,
  getUserById,
  updateUserStripeCustomer,
  getPlatformSettings,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
  createTransaction,
  getPaymentMethodId,
  clearPaymentMethodId,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";

interface ProviderResult {
  providerId: string;
  providerName: string;
  status: "succeeded" | "requires_action" | "failed";
  leadCount: number;
  amountCents: number;
  error?: string;
  clientSecret?: string;
  paymentIntentId?: string;
}

/**
 * POST /api/stripe/batch-pay
 * Charge buyer's saved payment method server-side for all pending leads.
 * Groups leads by provider, creates one PaymentIntent per provider group.
 *
 * Body: { leadIds: string[] }
 * Returns: { results: ProviderResult[], needsSetup?: boolean }
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

    // Get or create Stripe Customer
    const buyer = await getUserById(session.user.id);
    if (!buyer) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    let customerId = buyer.stripe_customer_id;

    // Validate existing customer ID
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

    // Get saved payment method — DB first, then Stripe fallback
    let paymentMethodId = await getPaymentMethodId(session.user.id);

    if (!paymentMethodId) {
      // Fallback: check Stripe Customer's default payment method
      const customer = await stripe.customers.retrieve(customerId);
      if (!customer.deleted) {
        const defaultPm = customer.invoice_settings?.default_payment_method;
        if (defaultPm) {
          paymentMethodId = typeof defaultPm === "string" ? defaultPm : defaultPm.id;
        }
      }
    }

    if (!paymentMethodId) {
      // No saved payment method — buyer needs to set one up
      return NextResponse.json({ needsSetup: true, error: "No saved payment method. Please connect a payment method first." }, { status: 200 });
    }

    // Group leads by provider
    const providerGroups = new Map<string, typeof leads>();
    for (const lead of leads) {
      const group = providerGroups.get(lead.provider_id) || [];
      group.push(lead);
      providerGroups.set(lead.provider_id, group);
    }

    // Validate all providers are onboarded
    const providerIds = Array.from(providerGroups.keys());
    const providers = await getProvidersByIds(providerIds);
    const providerMap = new Map(providers.map(p => [p.id, p]));

    for (const pid of providerIds) {
      const provider = providerMap.get(pid);
      if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
        return NextResponse.json({
          error: `Provider ${provider?.display_name || provider?.username || pid} has not completed Stripe onboarding.`,
        }, { status: 400 });
      }
    }

    const platformFees = await getPlatformSettings();
    const results: ProviderResult[] = [];

    // Process each provider group
    for (const [providerId, providerLeads] of providerGroups) {
      const provider = providerMap.get(providerId)!;
      let totalCents = 0;
      let applicationFeeCents = 0;

      for (const lead of providerLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        totalCents += Math.round(breakdown.buyerTotal * 100);
        applicationFeeCents += Math.round(breakdown.totalPlatformFee * 100);
      }

      const providerLeadIds = providerLeads.map(l => l.id);

      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: totalCents,
          currency: "usd",
          customer: customerId,
          payment_method: paymentMethodId,
          off_session: true,
          confirm: true,
          application_fee_amount: applicationFeeCents,
          transfer_data: {
            destination: provider.stripe_account_id!,
          },
          metadata: {
            lead_ids: providerLeadIds.join(","),
            buyer_id: session.user.id,
            provider_id: providerId,
            lead_count: String(providerLeads.length),
            payment_type: "batch_off_session",
          },
        });

        if (paymentIntent.status === "succeeded") {
          // Atomic claim — mark leads as completed
          const claimedIds = await batchUpdateLeadStripeTransfer(providerLeadIds, paymentIntent.id, "completed");
          const claimedSet = new Set(claimedIds);
          const claimedLeads = providerLeads.filter(l => claimedSet.has(l.id));

          // Create transaction records
          for (const lead of claimedLeads) {
            const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);

            await createTransaction({
              type: "platform_fee",
              status: "completed",
              amount: breakdown.totalPlatformFee,
              fee_amount: 0,
              net_amount: breakdown.totalPlatformFee,
              from_account_id: session.user.id,
              to_account_id: null,
              lead_id: lead.id,
              connection_id: lead.connection_id || undefined,
              stripe_payment_id: paymentIntent.id,
              description: `WOML platform fee (batch payment)`,
            });

            await createTransaction({
              type: "lead_payout",
              status: "completed",
              amount: breakdown.providerNet,
              fee_amount: breakdown.providerFee,
              net_amount: breakdown.providerNet,
              from_account_id: null,
              to_account_id: providerId,
              lead_id: lead.id,
              connection_id: lead.connection_id || undefined,
              stripe_payment_id: paymentIntent.id,
              description: `Provider payout via Stripe (off-session batch)`,
            });
          }

          results.push({
            providerId,
            providerName: provider.display_name || provider.username || "Provider",
            status: "succeeded",
            leadCount: claimedLeads.length,
            amountCents: totalCents,
            paymentIntentId: paymentIntent.id,
          });
        } else if (paymentIntent.status === "requires_action") {
          // 3D Secure required — return client_secret for frontend confirmation
          results.push({
            providerId,
            providerName: provider.display_name || provider.username || "Provider",
            status: "requires_action",
            leadCount: providerLeads.length,
            amountCents: totalCents,
            clientSecret: paymentIntent.client_secret!,
            paymentIntentId: paymentIntent.id,
          });
        } else {
          results.push({
            providerId,
            providerName: provider.display_name || provider.username || "Provider",
            status: "failed",
            leadCount: providerLeads.length,
            amountCents: totalCents,
            error: `Unexpected payment status: ${paymentIntent.status}`,
            paymentIntentId: paymentIntent.id,
          });
        }
      } catch (err: any) {
        // Check for card decline — clear saved method
        if (err?.code === "card_declined" || err?.type === "StripeCardError") {
          await clearPaymentMethodId(session.user.id);
          return NextResponse.json({
            needsSetup: true,
            error: "Your card was declined. Please update your payment method.",
            results,
          });
        }

        // Check for authentication_required (SCA)
        if (err?.code === "authentication_required" && err?.raw?.payment_intent) {
          const pi = err.raw.payment_intent;
          results.push({
            providerId,
            providerName: provider.display_name || provider.username || "Provider",
            status: "requires_action",
            leadCount: providerLeads.length,
            amountCents: totalCents,
            clientSecret: pi.client_secret,
            paymentIntentId: pi.id,
          });
          continue;
        }

        results.push({
          providerId,
          providerName: provider.display_name || provider.username || "Provider",
          status: "failed",
          leadCount: providerLeads.length,
          amountCents: totalCents,
          error: err?.message || "Payment failed",
        });
      }
    }

    const succeeded = results.filter(r => r.status === "succeeded").length;
    const failed = results.filter(r => r.status === "failed").length;
    const requires3ds = results.filter(r => r.status === "requires_action").length;

    console.log(`[batch-pay] ${succeeded} succeeded, ${failed} failed, ${requires3ds} requires 3DS for buyer ${session.user.id}`);

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[batch-pay] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Batch payment failed" }, { status: 500 });
  }
}
