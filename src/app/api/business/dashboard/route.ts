import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getLeadsByBuyerId,
  getPlatformSettings,
  getInviteTokensByBuyer,
  getBusinessCriteriaWithFields,
} from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { neon } from "@neondatabase/serverless";

// One-time migration: add quote_completed column if missing
let migrationRan = false;
async function ensureQuoteColumn() {
  if (migrationRan) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_completed BOOLEAN DEFAULT FALSE`;
  migrationRan = true;
}

// GET /api/business/dashboard — unified dashboard data (buyer auth)
// Runs all queries in parallel to avoid multiple cold starts
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const role = (session.user as any).role as string;
    if (role !== "buyer") {
      return NextResponse.json({ error: "Only businesses can access dashboard" }, { status: 403 });
    }

    const userId = session.user.id;

    await ensureQuoteColumn();

    // Run all DB queries in parallel
    const [rawLeads, platformSettings, inviteTokens, criteriaResult] = await Promise.all([
      getLeadsByBuyerId(userId),
      getPlatformSettings(),
      getInviteTokensByBuyer(userId),
      getBusinessCriteriaWithFields(userId),
    ]);

    // Decrypt/sanitize leads (buyer sees full PII)
    const leads = await Promise.all(rawLeads.map(async (lead) => {
      let customerName = "Unknown";
      let customerEmail: string | null = null;
      let customerPhone: string | null = null;
      let customerLicenseImage: string | null = null;
      let customerMaritalStatus: string | null = null;
      let customerHasInsurance: string | null = null;
      try {
        const decrypted = await decrypt(lead.customer_data_encrypted, lead.customer_data_iv);
        const parsed = JSON.parse(decrypted);
        customerName = parsed.name || parsed.customerName || "Unknown";
        customerEmail = parsed.email || null;
        customerPhone = parsed.phone || null;
        customerLicenseImage = parsed.licenseImage || null;
        customerMaritalStatus = parsed.maritalStatus || null;
        customerHasInsurance = parsed.hasInsurance || null;
      } catch { /* decryption may fail if key changed */ }

      return {
        id: lead.id,
        providerId: lead.provider_id,
        buyerId: lead.buyer_id,
        connectionId: lead.connection_id,
        status: lead.status,
        customerName,
        customerEmail,
        customerPhone,
        customerLicenseImage,
        customerMaritalStatus,
        customerHasInsurance,
        customerState: lead.customer_state,
        vehicleYear: lead.vehicle_year,
        vehicleMake: lead.vehicle_make,
        vehicleModel: lead.vehicle_model,
        payoutAmount: lead.payout_amount,
        payoutStatus: lead.payout_status,
        payoutCompletedAt: lead.payout_completed_at,
        submittedAt: lead.submitted_at,
        providerName: lead.provider_name || null,
        buyerName: lead.buyer_name || null,
        buyerBusinessName: lead.buyer_business_name || null,
        criteriaFieldsData: lead.criteria_fields_data,
        quoteCompleted: lead.quote_completed ?? false,
      };
    }));

    return NextResponse.json({
      success: true,
      leads,
      feeSettings: platformSettings,
      inviteTokens,
      criteria: criteriaResult?.criteria || null,
      criteriaFields: criteriaResult?.fields || [],
    });
  } catch (error) {
    console.error("[BUSINESS-DASHBOARD] GET error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
