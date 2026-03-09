import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import {
  getProcessingLeadsByProviderId,
  getProvidersByIds,
  batchUpdateLeadStripeTransfer,
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
    const { providerId: specificProviderId } = body as { providerId?: string };

    const sql = getDb();

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
  } catch (error) {
    console.error("[ADMIN-RETRY-TRANSFERS] error:", error);
    return NextResponse.json({ error: "Retry failed" }, { status: 500 });
  }
}
