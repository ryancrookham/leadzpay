import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getLeadsByIds,
  getProcessingLeadsByProviderId,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
  batchUpdateLeadPayoutStatus,
  createTransaction,
  getPlatformSettings,
} from "@/lib/db";
import { calculateFeeBreakdown } from "@/lib/platform-fees";
import { neon } from "@neondatabase/serverless";

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return neon(url);
}

/**
 * POST /api/admin/retry-transfers
 * Admin-only: retry Stripe Connect transfers for all leads stuck in "processing"
 * (i.e. payment was collected by WOML but provider transfer never happened).
 *
 * Optionally pass { providerId } to retry for a specific provider only.
 * Without a body, retries all providers with stuck processing leads.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { providerId: specificProviderId, checkoutSessionId, forceProviderEmail, markPaidManual } = body as {
      providerId?: string;
      checkoutSessionId?: string;
      forceProviderEmail?: string;
      markPaidManual?: boolean;
    };

    const sql = getDb();

    // If a checkout session ID is given, reprocess that specific Stripe payment
    // (handles the case where the webhook never fired and leads are still "pending")
    if (checkoutSessionId) {
      const checkoutSession = await stripe.checkout.sessions.retrieve(checkoutSessionId);
      if (checkoutSession.payment_status !== "paid") {
        return NextResponse.json({ error: "Checkout session has not been paid" }, { status: 400 });
      }

      const leadIdsStr = checkoutSession.metadata?.lead_ids;
      const buyerId = checkoutSession.metadata?.buyer_id;
      if (!leadIdsStr || !buyerId) {
        return NextResponse.json({ error: "Session metadata missing lead_ids or buyer_id" }, { status: 400 });
      }

      const leadIds = leadIdsStr.split(",");
      const leads = await getLeadsByIds(leadIds);
      const platformFees = await getPlatformSettings();

      const leadsByProvider = new Map<string, typeof leads>();
      for (const lead of leads) {
        const existing = leadsByProvider.get(lead.provider_id) || [];
        existing.push(lead);
        leadsByProvider.set(lead.provider_id, existing);
      }

      const pIds = Array.from(leadsByProvider.keys());
      const providers = await getProvidersByIds(pIds);
      const providerMap = new Map(providers.map((p: any) => [p.id, p]));

      let transferred = 0;
      let failed = 0;
      const results: Array<{ providerId: string; status: string; amount?: number; error?: string }> = [];

      for (const [providerId, providerLeads] of leadsByProvider) {
        const provider = providerMap.get(providerId);
        const providerLeadIds = providerLeads.map((l) => l.id);

        // Mark as processing first
        await batchUpdateLeadPayoutStatus(providerLeadIds, "processing");

        if (!provider?.stripe_account_id || !provider.stripe_onboarding_complete) {
          results.push({ providerId, status: "skipped", error: "Provider not on Stripe Connect" });
          continue;
        }

        let transferCents = 0;
        for (const lead of providerLeads) {
          const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
          transferCents += Math.round(breakdown.providerNet * 100);
        }

        try {
          const transfer = await stripe.transfers.create({
            amount: transferCents,
            currency: "usd",
            destination: provider.stripe_account_id,
            transfer_group: checkoutSessionId,
            metadata: {
              lead_ids: providerLeadIds.join(","),
              provider_id: providerId,
              buyer_id: buyerId,
              trigger: "admin_session_retry",
            },
          });

          await batchUpdateLeadStripeTransfer(providerLeadIds, transfer.id, "completed");

          for (const lead of providerLeads) {
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
              stripe_payment_id: checkoutSession.payment_intent as string || undefined,
              description: `Platform fee for lead (admin session retry)`,
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
              stripe_payment_id: transfer.id,
              description: `Provider payout via Stripe Connect (admin session retry)`,
            });
          }

          transferred++;
          results.push({ providerId, status: "transferred", amount: transferCents / 100 });
          console.log(`[ADMIN-RETRY] Session retry transfer ${transfer.id} → provider ${providerId}: $${(transferCents / 100).toFixed(2)}`);
        } catch (err: any) {
          failed++;
          results.push({ providerId, status: "failed", error: err?.message });
          console.error(`[ADMIN-RETRY] Session retry transfer failed for provider ${providerId}:`, err);
        }
      }

      return NextResponse.json({
        message: `Session retry complete: ${transferred} transferred, ${failed} failed`,
        transferred,
        failed,
        results,
      });
    }

    // Mark all unpaid leads for a provider as paid in DB without any Stripe transfer.
    // Use when the money doesn't need to actually move (e.g. co-founder, test data, or
    // funds already settled outside of Stripe).
    if (markPaidManual && forceProviderEmail) {
      const providerRows = await sql`SELECT * FROM users WHERE email = ${forceProviderEmail} AND role = 'provider' LIMIT 1`;
      if (providerRows.length === 0) {
        return NextResponse.json({ error: "Provider not found with that email" }, { status: 404 });
      }
      const provider = providerRows[0] as any;

      const unpaidLeads = await sql`
        SELECT * FROM leads
        WHERE provider_id = ${provider.id}
        AND payout_status IN ('pending', 'processing')
        AND stripe_transfer_id IS NULL
      `;
      if (unpaidLeads.length === 0) {
        return NextResponse.json({ message: "No unpaid leads found — already clean", cleared: 0 });
      }

      const platformFees = await getPlatformSettings();
      const leadIds = (unpaidLeads as any[]).map((l) => l.id);
      const syntheticId = `manual_admin_${Date.now()}`;

      await batchUpdateLeadStripeTransfer(leadIds, syntheticId, "completed");

      for (const lead of unpaidLeads as any[]) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        await createTransaction({
          type: "lead_payout",
          status: "completed",
          amount: breakdown.providerNet,
          fee_amount: breakdown.providerFee,
          net_amount: breakdown.providerNet,
          from_account_id: null,
          to_account_id: provider.id,
          lead_id: lead.id,
          connection_id: lead.connection_id || undefined,
          stripe_payment_id: syntheticId,
          description: `Provider payout — manually cleared by admin (no Stripe transfer)`,
        });
      }

      return NextResponse.json({
        message: `Manually marked ${leadIds.length} lead(s) as paid for ${forceProviderEmail} (no Stripe transfer)`,
        cleared: leadIds.length,
        leadIds,
        syntheticId,
      });
    }

    // Force-transfer all unpaid leads for a provider identified by email (bypasses checkout session)
    if (forceProviderEmail) {
      const providerRows = await sql`SELECT * FROM users WHERE email = ${forceProviderEmail} AND role = 'provider' LIMIT 1`;
      if (providerRows.length === 0) {
        return NextResponse.json({ error: "Provider not found with that email" }, { status: 404 });
      }
      const provider = providerRows[0] as any;
      if (!provider.stripe_account_id || !provider.stripe_onboarding_complete) {
        return NextResponse.json({ error: "Provider has not completed Stripe Connect onboarding" }, { status: 400 });
      }

      // Get all pending/processing leads for this provider
      const unpaidLeads = await sql`
        SELECT * FROM leads
        WHERE provider_id = ${provider.id}
        AND payout_status IN ('pending', 'processing')
      `;
      if (unpaidLeads.length === 0) {
        return NextResponse.json({ error: "No unpaid leads found for this provider" }, { status: 404 });
      }

      const platformFees = await getPlatformSettings();
      let transferCents = 0;
      for (const lead of unpaidLeads as any[]) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        transferCents += Math.round(breakdown.providerNet * 100);
      }

      const leadIds = (unpaidLeads as any[]).map((l) => l.id);
      await batchUpdateLeadPayoutStatus(leadIds, "processing");

      const transfer = await stripe.transfers.create({
        amount: transferCents,
        currency: "usd",
        destination: provider.stripe_account_id,
        metadata: {
          lead_ids: leadIds.join(","),
          provider_id: provider.id,
          trigger: "admin_force_transfer",
        },
      });

      await batchUpdateLeadStripeTransfer(leadIds, transfer.id, "completed");

      for (const lead of unpaidLeads as any[]) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        await createTransaction({
          type: "lead_payout",
          status: "completed",
          amount: breakdown.providerNet,
          fee_amount: breakdown.providerFee,
          net_amount: breakdown.providerNet,
          from_account_id: null,
          to_account_id: provider.id,
          lead_id: lead.id,
          connection_id: lead.connection_id || undefined,
          stripe_payment_id: transfer.id,
          description: `Provider payout via Stripe Connect (admin force transfer)`,
        });
      }

      return NextResponse.json({
        message: `Force transfer complete: $${(transferCents / 100).toFixed(2)} sent to ${forceProviderEmail}`,
        transferred: 1,
        transferId: transfer.id,
        amount: transferCents / 100,
        leadCount: leadIds.length,
      });
    }

    // Find all providers who have processing leads (payment collected, transfer pending)
    let providerIds: string[];
    if (specificProviderId) {
      providerIds = [specificProviderId];
    } else {
      const rows = await sql`
        SELECT DISTINCT provider_id
        FROM leads
        WHERE payout_status = 'processing'
      `;
      providerIds = rows.map((r: any) => r.provider_id);
    }

    if (providerIds.length === 0) {
      return NextResponse.json({ message: "No processing leads found", transferred: 0, failed: 0 });
    }

    const providers = await getProvidersByIds(providerIds);
    const platformFees = await getPlatformSettings();

    let transferred = 0;
    let failed = 0;
    const results: Array<{ providerId: string; status: string; amount?: number; error?: string }> = [];

    for (const provider of providers) {
      if (!provider.stripe_account_id || !provider.stripe_onboarding_complete) {
        results.push({
          providerId: provider.id,
          status: "skipped",
          error: "Provider has not completed Stripe Connect onboarding",
        });
        continue;
      }

      const processingLeads = await getProcessingLeadsByProviderId(provider.id);
      if (processingLeads.length === 0) {
        results.push({ providerId: provider.id, status: "no_leads" });
        continue;
      }

      // Calculate total payout for this provider
      let transferCents = 0;
      for (const lead of processingLeads) {
        const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
        transferCents += Math.round(breakdown.providerNet * 100);
      }

      const leadIds = processingLeads.map((l) => l.id);

      try {
        const transfer = await stripe.transfers.create({
          amount: transferCents,
          currency: "usd",
          destination: provider.stripe_account_id,
          metadata: {
            lead_ids: leadIds.join(","),
            provider_id: provider.id,
            trigger: "admin_retry",
          },
        });

        // Mark leads as completed
        await batchUpdateLeadStripeTransfer(leadIds, transfer.id, "completed");

        // Create payout transaction records
        for (const lead of processingLeads) {
          const breakdown = calculateFeeBreakdown(lead.payout_amount, platformFees);
          await createTransaction({
            type: "lead_payout",
            status: "completed",
            amount: breakdown.providerNet,
            fee_amount: breakdown.providerFee,
            net_amount: breakdown.providerNet,
            from_account_id: null,
            to_account_id: provider.id,
            lead_id: lead.id,
            connection_id: lead.connection_id || undefined,
            stripe_payment_id: transfer.id,
            description: `Provider payout via Stripe Connect (admin retry)`,
          });
        }

        transferred++;
        results.push({
          providerId: provider.id,
          status: "transferred",
          amount: transferCents / 100,
        });

        console.log(
          `[ADMIN-RETRY] Transfer ${transfer.id} → provider ${provider.id}: $${(transferCents / 100).toFixed(2)} for ${leadIds.length} lead(s)`
        );
      } catch (err: any) {
        failed++;
        results.push({
          providerId: provider.id,
          status: "failed",
          error: err?.message || "Transfer creation failed",
        });
        console.error(`[ADMIN-RETRY] Transfer failed for provider ${provider.id}:`, err);
      }
    }

    return NextResponse.json({
      message: `Retry complete: ${transferred} transferred, ${failed} failed`,
      transferred,
      failed,
      results,
    });
  } catch (error: any) {
    console.error("[ADMIN-RETRY-TRANSFERS] error:", error);
    return NextResponse.json({ error: "Retry failed", detail: error?.message || String(error) }, { status: 500 });
  }
}
