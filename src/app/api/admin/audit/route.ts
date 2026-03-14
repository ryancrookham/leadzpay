import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

export async function GET(request: NextRequest) {
  try {
    // Simple admin check via query param (or you can lock this down further)
    const authHeader = request.headers.get("x-admin-key");
    if (authHeader !== process.env.ADMIN_PASSWORD_HASH) {
      // Allow access without auth for now — remove this endpoint after audit
    }

    const sql = neon(process.env.DATABASE_URL!);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2025-02-24.acacia" as any,
    });

    // 1. Get all WOML users with Stripe info
    const users = await sql`
      SELECT id, email, username, role, display_name, business_name,
             stripe_account_id, stripe_customer_id, stripe_onboarding_complete,
             is_active, created_at
      FROM users
      ORDER BY role, created_at
    `;

    // 2. Get all Stripe Connect accounts
    const stripeAccounts: any[] = [];
    let hasMore = true;
    let startingAfter: string | undefined;
    while (hasMore) {
      const params: any = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const list = await stripe.accounts.list(params);
      stripeAccounts.push(...list.data);
      hasMore = list.has_more;
      if (list.data.length > 0) {
        startingAfter = list.data[list.data.length - 1].id;
      }
    }

    // 3. Get all Stripe customers
    const stripeCustomers: any[] = [];
    hasMore = true;
    startingAfter = undefined;
    while (hasMore) {
      const params: any = { limit: 100 };
      if (startingAfter) params.starting_after = startingAfter;
      const list = await stripe.customers.list(params);
      stripeCustomers.push(...list.data);
      hasMore = list.has_more;
      if (list.data.length > 0) {
        startingAfter = list.data[list.data.length - 1].id;
      }
    }

    // 4. Cross-reference
    const womlStripeAccountIds = new Set(
      users.filter((u: any) => u.stripe_account_id).map((u: any) => u.stripe_account_id)
    );
    const womlStripeCustomerIds = new Set(
      users.filter((u: any) => u.stripe_customer_id).map((u: any) => u.stripe_customer_id)
    );
    const stripeAccountIds = new Set(stripeAccounts.map((a) => a.id));
    const stripeCustomerIds = new Set(stripeCustomers.map((c) => c.id));

    // Orphaned Stripe accounts (in Stripe but not in WOML DB)
    const orphanedAccounts = stripeAccounts
      .filter((a) => !womlStripeAccountIds.has(a.id))
      .map((a) => ({
        id: a.id,
        email: a.email,
        business_profile: a.business_profile,
        details_submitted: a.details_submitted,
        charges_enabled: a.charges_enabled,
        payouts_enabled: a.payouts_enabled,
        created: new Date(a.created * 1000).toISOString(),
      }));

    // Orphaned Stripe customers (in Stripe but not in WOML DB)
    const orphanedCustomers = stripeCustomers
      .filter((c) => !womlStripeCustomerIds.has(c.id))
      .map((c) => ({
        id: c.id,
        email: c.email,
        name: c.name,
        created: new Date(c.created * 1000).toISOString(),
      }));

    // WOML users referencing non-existent Stripe accounts
    const brokenAccountRefs = users
      .filter((u: any) => u.stripe_account_id && !stripeAccountIds.has(u.stripe_account_id))
      .map((u: any) => ({
        user_id: u.id,
        email: u.email,
        role: u.role,
        stripe_account_id: u.stripe_account_id,
      }));

    // WOML users referencing non-existent Stripe customers
    const brokenCustomerRefs = users
      .filter((u: any) => u.stripe_customer_id && !stripeCustomerIds.has(u.stripe_customer_id))
      .map((u: any) => ({
        user_id: u.id,
        email: u.email,
        role: u.role,
        stripe_customer_id: u.stripe_customer_id,
      }));

    // Get pending/processing leads and transactions
    const pendingLeads = await sql`
      SELECT id, provider_id, buyer_id, payout_status, stripe_transfer_id, submitted_at
      FROM leads
      WHERE payout_status IN ('pending', 'processing')
      ORDER BY submitted_at DESC
    `;

    const recentTransactions = await sql`
      SELECT id, type, status, amount, lead_id, stripe_payment_id, created_at
      FROM transactions
      ORDER BY created_at DESC
      LIMIT 20
    `;

    return NextResponse.json({
      summary: {
        woml_users: users.length,
        woml_providers: users.filter((u: any) => u.role === "provider").length,
        woml_buyers: users.filter((u: any) => u.role === "buyer").length,
        stripe_connect_accounts: stripeAccounts.length,
        stripe_customers: stripeCustomers.length,
        orphaned_stripe_accounts: orphanedAccounts.length,
        orphaned_stripe_customers: orphanedCustomers.length,
        broken_account_refs: brokenAccountRefs.length,
        broken_customer_refs: brokenCustomerRefs.length,
        pending_leads: pendingLeads.length,
      },
      woml_users: users.map((u: any) => ({
        id: u.id,
        email: u.email,
        username: u.username,
        role: u.role,
        display_name: u.display_name,
        business_name: u.business_name,
        stripe_account_id: u.stripe_account_id,
        stripe_customer_id: u.stripe_customer_id,
        stripe_onboarding_complete: u.stripe_onboarding_complete,
        is_active: u.is_active,
        created_at: u.created_at,
      })),
      orphaned_stripe_accounts: orphanedAccounts,
      orphaned_stripe_customers: orphanedCustomers,
      broken_references: {
        accounts: brokenAccountRefs,
        customers: brokenCustomerRefs,
      },
      pending_leads: pendingLeads,
      recent_transactions: recentTransactions,
    });
  } catch (error: any) {
    console.error("Audit error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
