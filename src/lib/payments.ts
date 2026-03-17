import { stripe } from "@/lib/stripe";
import { calculateFeeBreakdown } from "@/lib/platform-fees";
import {
  getUserById,
  updateUserStripeCustomer,
  getPlatformSettings,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
  createTransaction,
  getPaymentMethodId,
  clearPaymentMethodId,
  updatePaymentMethodId,
  type DbLead,
} from "@/lib/db";

export interface ProviderResult {
  providerId: string;
  providerName: string;
  status: "succeeded" | "requires_action" | "failed";
  leadCount: number;
  amountCents: number;
  error?: string;
  clientSecret?: string;
  paymentIntentId?: string;
}

export interface BatchPayResult {
  results: ProviderResult[];
  needsSetup?: boolean;
  error?: string;
}

/**
 * Core batch payment logic. Resolves Stripe customer + payment method,
 * groups leads by provider, creates one PaymentIntent per provider group.
 *
 * Used by both the manual batch-pay API route and the auto-pay cron job.
 */
export async function processBatchPayment(
  buyerId: string,
  leads: DbLead[]
): Promise<BatchPayResult> {
  // Get or create Stripe Customer
  const buyer = await getUserById(buyerId);
  if (!buyer) {
    return { results: [], error: "User not found" };
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

  // Get saved payment method — DB first, then Stripe fallbacks
  let paymentMethodId = await getPaymentMethodId(buyerId);

  if (!paymentMethodId) {
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      const defaultPm = customer.invoice_settings?.default_payment_method;
      if (defaultPm) {
        paymentMethodId = typeof defaultPm === "string" ? defaultPm : defaultPm.id;
      }
    }
  }

  if (!paymentMethodId) {
    const methods = await stripe.paymentMethods.list({
      customer: customerId,
      limit: 1,
    });
    if (methods.data.length > 0) {
      paymentMethodId = methods.data[0].id;
    }
  }

  // Cache discovered payment method
  if (paymentMethodId && !(await getPaymentMethodId(buyerId))) {
    try {
      await updatePaymentMethodId(buyerId, paymentMethodId);
      await stripe.customers.update(customerId, {
        invoice_settings: { default_payment_method: paymentMethodId },
      });
    } catch (e) {
      console.warn("[payments] Failed to cache payment method:", e);
    }
  }

  if (!paymentMethodId) {
    return {
      results: [],
      needsSetup: true,
      error: "No saved payment method. Please go to Settings and connect a payment method first.",
    };
  }

  // Group leads by provider
  const providerGroups = new Map<string, DbLead[]>();
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
      return {
        results: [],
        error: `Provider ${provider?.display_name || provider?.username || pid} has not completed Stripe onboarding.`,
      };
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
          buyer_id: buyerId,
          provider_id: providerId,
          lead_count: String(providerLeads.length),
          payment_type: "batch_off_session",
        },
      });

      if (paymentIntent.status === "succeeded") {
        const claimedIds = await batchUpdateLeadStripeTransfer(providerLeadIds, paymentIntent.id, "completed");
        const claimedSet = new Set(claimedIds);
        const claimedLeads = providerLeads.filter(l => claimedSet.has(l.id));

        for (const lead of claimedLeads) {
          const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);

          await createTransaction({
            type: "platform_fee",
            status: "completed",
            amount: breakdown.totalPlatformFee,
            fee_amount: 0,
            net_amount: breakdown.totalPlatformFee,
            from_account_id: buyerId,
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
      if (err?.code === "card_declined" || err?.type === "StripeCardError") {
        await clearPaymentMethodId(buyerId);
        return {
          results,
          needsSetup: true,
          error: "Your card was declined. Please update your payment method.",
        };
      }

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

  console.log(`[payments] ${succeeded} succeeded, ${failed} failed, ${requires3ds} requires 3DS for buyer ${buyerId}`);

  return { results };
}
