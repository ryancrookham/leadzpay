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

// One-time migration: add new columns if missing
let migrationRan = false;
async function ensureMigrations() {
  if (migrationRan) return;
  const sql = neon(process.env.DATABASE_URL!);
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_completed BOOLEAN DEFAULT FALSE`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_status TEXT DEFAULT 'new'`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_type TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS pipeline_notes TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS quoted_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS sold_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS dead_at TIMESTAMPTZ`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS contacted_sub_status TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS dead_reason TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to TEXT`;
  await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS follow_up_date DATE`;
  await sql`CREATE TABLE IF NOT EXISTS lead_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    business_id UUID NOT NULL,
    actor_name TEXT NOT NULL,
    action TEXT NOT NULL,
    from_value TEXT,
    to_value TEXT,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_lead_id ON lead_activity_log(lead_id)`;
  await sql`CREATE TABLE IF NOT EXISTS business_settings (
    business_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    dead_lead_window_days INTEGER DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
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

    await ensureMigrations();

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
        pipelineStatus: lead.pipeline_status ?? 'new',
        contactType: lead.contact_type ?? null,
        pipelineNotes: lead.pipeline_notes ?? null,
        contactedAt: lead.contacted_at ?? null,
        quotedAt: lead.quoted_at ?? null,
        soldAt: lead.sold_at ?? null,
        deadAt: lead.dead_at ?? null,
        contactedSubStatus: lead.contacted_sub_status ?? null,
        deadReason: lead.dead_reason ?? null,
        assignedTo: lead.assigned_to ?? null,
        followUpDate: lead.follow_up_date ?? null,
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
