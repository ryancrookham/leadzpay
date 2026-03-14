import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import Stripe from "stripe";

interface HealthCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  message: string;
  details?: any;
  fixable?: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      maxNetworkRetries: 1,
      timeout: 15000,
    });

    const checks: HealthCheck[] = [];

    // ============================================
    // 1. STRIPE CONNECTION
    // ============================================
    try {
      const account = await stripe.accounts.retrieve();
      checks.push({
        name: "Stripe API Connection",
        status: "pass",
        message: `Connected as ${account.business_profile?.name || account.id}`,
        details: {
          charges_enabled: account.charges_enabled,
          payouts_enabled: account.payouts_enabled,
          country: account.country,
        },
      });
    } catch (err: any) {
      checks.push({
        name: "Stripe API Connection",
        status: "fail",
        message: `Cannot reach Stripe: ${err.message}`,
      });
    }

    // ============================================
    // 2. WEBHOOK SECRET CONFIGURED
    // ============================================
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      checks.push({
        name: "Webhook Secret",
        status: "fail",
        message: "STRIPE_WEBHOOK_SECRET env var is empty — all webhooks will be rejected",
      });
    } else if (!webhookSecret.startsWith("whsec_")) {
      checks.push({
        name: "Webhook Secret",
        status: "warn",
        message: "STRIPE_WEBHOOK_SECRET doesn't start with 'whsec_' — may be invalid",
      });
    } else {
      checks.push({
        name: "Webhook Secret",
        status: "pass",
        message: `Configured (${webhookSecret.slice(0, 10)}...)`,
      });
    }

    // ============================================
    // 3. WEBHOOK DELIVERY STATUS (check recent events)
    // ============================================
    try {
      const recentEvents = await stripe.events.list({ limit: 10 });
      const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 5 });

      const activeEndpoint = webhookEndpoints.data.find(
        (e) => e.status === "enabled" && e.url.includes("womleads.com")
      );

      if (!activeEndpoint) {
        checks.push({
          name: "Webhook Endpoint",
          status: "warn",
          message: "No active webhook endpoint found for womleads.com in Stripe",
        });
      } else {
        checks.push({
          name: "Webhook Endpoint",
          status: "pass",
          message: `Active: ${activeEndpoint.url}`,
          details: {
            enabled_events: activeEndpoint.enabled_events,
            api_version: activeEndpoint.api_version,
          },
        });
      }

      // Check if recent events exist
      if (recentEvents.data.length > 0) {
        const latestEvent = recentEvents.data[0];
        const eventAge = Date.now() - latestEvent.created * 1000;
        const ageHours = Math.round(eventAge / 3600000);
        checks.push({
          name: "Recent Stripe Events",
          status: ageHours > 72 ? "warn" : "pass",
          message: `${recentEvents.data.length} recent events, latest ${ageHours}h ago (${latestEvent.type})`,
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Webhook Status",
        status: "warn",
        message: `Could not check webhook status: ${err.message}`,
      });
    }

    // ============================================
    // 4. DATABASE CONNECTION
    // ============================================
    try {
      const dbTest = await sql`SELECT NOW() as now, current_database() as db`;
      checks.push({
        name: "Database Connection",
        status: "pass",
        message: `Connected to ${dbTest[0]?.db}`,
      });
    } catch (err: any) {
      checks.push({
        name: "Database Connection",
        status: "fail",
        message: `Database unreachable: ${err.message}`,
      });
    }

    // ============================================
    // 5. REQUIRED TABLES EXIST
    // ============================================
    try {
      const tables = await sql`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `;
      const tableNames = tables.map((t: any) => t.table_name);
      const required = ["users", "leads", "transactions", "connections", "platform_settings", "processed_webhooks"];
      const missing = required.filter((t) => !tableNames.includes(t));

      if (missing.length > 0) {
        checks.push({
          name: "Required Tables",
          status: "fail",
          message: `Missing tables: ${missing.join(", ")}`,
          details: { existing: tableNames, missing },
        });
      } else {
        checks.push({
          name: "Required Tables",
          status: "pass",
          message: `All ${required.length} required tables exist`,
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Required Tables",
        status: "fail",
        message: `Cannot check tables: ${err.message}`,
      });
    }

    // ============================================
    // 6. FEE SETTINGS VALID
    // ============================================
    try {
      const feeRows = await sql`SELECT key, value FROM platform_settings WHERE key IN ('fee_type', 'fee_percent', 'fee_percent_buyer_share')`;
      const feeMap: Record<string, string> = {};
      for (const row of feeRows) feeMap[row.key] = row.value;

      const feeType = feeMap.fee_type || "percent";
      const feePct = parseFloat(feeMap.fee_percent || "12.5");
      const buyerShare = parseFloat(feeMap.fee_percent_buyer_share || "50");

      if (isNaN(feePct) || feePct <= 0 || feePct > 50) {
        checks.push({
          name: "Fee Settings",
          status: "fail",
          message: `Fee percent is invalid: ${feePct}%`,
        });
      } else if (isNaN(buyerShare) || buyerShare < 0 || buyerShare > 100) {
        checks.push({
          name: "Fee Settings",
          status: "fail",
          message: `Buyer share is invalid: ${buyerShare}%`,
        });
      } else {
        const exampleRate = 10;
        const totalFee = Math.round((exampleRate * feePct / 100) * 100) / 100;
        const buyerFee = Math.round(totalFee * (buyerShare / 100) * 100) / 100;
        const providerFee = Math.round((totalFee - buyerFee) * 100) / 100;

        checks.push({
          name: "Fee Settings",
          status: "pass",
          message: `${feePct}% ${feeType} fee, ${buyerShare}% buyer / ${100 - buyerShare}% provider split`,
          details: {
            example: `$${exampleRate} lead → Buyer pays $${(exampleRate + buyerFee).toFixed(2)}, Provider gets $${(exampleRate - providerFee).toFixed(2)}, WOML keeps $${totalFee.toFixed(2)}`,
          },
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Fee Settings",
        status: "warn",
        message: `Could not load fee settings (using defaults): ${err.message}`,
      });
    }

    // ============================================
    // 7. ORPHANED STRIPE ACCOUNTS (in Stripe but not DB)
    // ============================================
    try {
      const stripeAccounts = await stripe.accounts.list({ limit: 100 });
      const dbUsers = await sql`
        SELECT id, email, stripe_account_id, stripe_customer_id, role, is_active
        FROM users
        WHERE stripe_account_id IS NOT NULL OR stripe_customer_id IS NOT NULL
      `;

      const dbAccountIds = new Set(dbUsers.filter((u: any) => u.stripe_account_id).map((u: any) => u.stripe_account_id));
      const orphanedAccounts = stripeAccounts.data.filter((a) => !dbAccountIds.has(a.id));

      if (orphanedAccounts.length > 0) {
        checks.push({
          name: "Orphaned Stripe Accounts",
          status: "warn",
          message: `${orphanedAccounts.length} Stripe Connect account(s) have no matching WOML user`,
          details: orphanedAccounts.map((a) => ({
            id: a.id,
            email: a.email,
            created: a.created ? new Date(a.created * 1000).toISOString() : null,
          })),
          fixable: true,
        });
      } else {
        checks.push({
          name: "Orphaned Stripe Accounts",
          status: "pass",
          message: `All ${stripeAccounts.data.length} Stripe accounts match WOML users`,
        });
      }

      // Check reverse: DB users pointing to deleted Stripe accounts
      const stripeAccountIds = new Set(stripeAccounts.data.map((a) => a.id));
      const brokenRefs = dbUsers.filter(
        (u: any) => u.stripe_account_id && !stripeAccountIds.has(u.stripe_account_id)
      );

      if (brokenRefs.length > 0) {
        checks.push({
          name: "Broken Stripe References",
          status: "warn",
          message: `${brokenRefs.length} WOML user(s) reference deleted Stripe accounts`,
          details: brokenRefs.map((u: any) => ({
            user_id: u.id,
            email: u.email,
            stripe_account_id: u.stripe_account_id,
          })),
          fixable: true,
        });
      } else {
        checks.push({
          name: "Broken Stripe References",
          status: "pass",
          message: "All user Stripe references are valid",
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Stripe Account Sync",
        status: "warn",
        message: `Could not audit Stripe accounts: ${err.message}`,
      });
    }

    // ============================================
    // 8. LEAD INTEGRITY — payout_status vs stripe data
    // ============================================
    try {
      // Completed leads without transfer ID
      const completedNoTransfer = await sql`
        SELECT COUNT(*)::int as count FROM leads
        WHERE payout_status = 'completed' AND stripe_transfer_id IS NULL AND stripe_payment_id IS NULL
      `;

      if (completedNoTransfer[0].count > 0) {
        checks.push({
          name: "Lead Payment Integrity",
          status: "warn",
          message: `${completedNoTransfer[0].count} lead(s) marked 'completed' but have no Stripe payment/transfer ID`,
          fixable: true,
        });
      }

      // Stuck processing leads (older than 1 hour)
      const stuckProcessing = await sql`
        SELECT COUNT(*)::int as count FROM leads
        WHERE payout_status = 'processing'
        AND submitted_at < NOW() - INTERVAL '1 hour'
      `;

      if (stuckProcessing[0].count > 0) {
        checks.push({
          name: "Stuck Processing Leads",
          status: "warn",
          message: `${stuckProcessing[0].count} lead(s) stuck in 'processing' for over 1 hour`,
          fixable: true,
        });
      }

      // Overall lead stats
      const leadStats = await sql`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE payout_status = 'pending')::int as pending,
          COUNT(*) FILTER (WHERE payout_status = 'processing')::int as processing,
          COUNT(*) FILTER (WHERE payout_status = 'completed')::int as completed,
          COUNT(*) FILTER (WHERE payout_status = 'failed')::int as failed
        FROM leads
      `;

      const ls = leadStats[0];
      const hasIssues = (completedNoTransfer[0].count > 0) || (stuckProcessing[0].count > 0);

      if (!hasIssues) {
        checks.push({
          name: "Lead Integrity",
          status: "pass",
          message: `${ls.total} leads: ${ls.completed} completed, ${ls.pending} pending, ${ls.processing} processing, ${ls.failed} failed`,
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Lead Integrity",
        status: "warn",
        message: `Could not check lead integrity: ${err.message}`,
      });
    }

    // ============================================
    // 9. TRANSACTION INTEGRITY — leads vs transactions match
    // ============================================
    try {
      // Completed leads without transaction records
      const leadsNoTx = await sql`
        SELECT COUNT(*)::int as count FROM leads l
        WHERE l.payout_status = 'completed'
        AND NOT EXISTS (
          SELECT 1 FROM transactions t WHERE t.lead_id = l.id
        )
      `;

      if (leadsNoTx[0].count > 0) {
        checks.push({
          name: "Transaction Records",
          status: "warn",
          message: `${leadsNoTx[0].count} completed lead(s) have no transaction record — earnings may not display correctly`,
          fixable: true,
        });
      } else {
        checks.push({
          name: "Transaction Records",
          status: "pass",
          message: "All completed leads have matching transaction records",
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Transaction Records",
        status: "warn",
        message: `Could not check transactions: ${err.message}`,
      });
    }

    // ============================================
    // 10. PROVIDER ONBOARDING STATUS
    // ============================================
    try {
      const providerStats = await sql`
        SELECT
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE stripe_account_id IS NOT NULL)::int as has_stripe,
          COUNT(*) FILTER (WHERE stripe_onboarding_complete = true)::int as onboarded,
          COUNT(*) FILTER (WHERE stripe_account_id IS NOT NULL AND stripe_onboarding_complete = false)::int as incomplete
        FROM users
        WHERE role = 'provider' AND is_active = true
      `;

      const ps = providerStats[0];
      if (ps.incomplete > 0) {
        checks.push({
          name: "Provider Onboarding",
          status: "warn",
          message: `${ps.incomplete} active provider(s) started Stripe onboarding but haven't finished`,
          details: {
            total_providers: ps.total,
            has_stripe_account: ps.has_stripe,
            fully_onboarded: ps.onboarded,
            incomplete: ps.incomplete,
          },
        });
      } else {
        checks.push({
          name: "Provider Onboarding",
          status: "pass",
          message: `${ps.onboarded}/${ps.total} active providers fully onboarded`,
        });
      }
    } catch (err: any) {
      checks.push({
        name: "Provider Onboarding",
        status: "warn",
        message: `Could not check provider status: ${err.message}`,
      });
    }

    // ============================================
    // 11. ENVIRONMENT VARIABLES
    // ============================================
    const envChecks = [
      { key: "STRIPE_SECRET_KEY", set: !!process.env.STRIPE_SECRET_KEY },
      { key: "STRIPE_WEBHOOK_SECRET", set: !!process.env.STRIPE_WEBHOOK_SECRET },
      { key: "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", set: !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY },
      { key: "DATABASE_URL", set: !!process.env.DATABASE_URL },
      { key: "NEXTAUTH_SECRET", set: !!process.env.NEXTAUTH_SECRET },
      { key: "ENCRYPTION_KEY", set: !!process.env.ENCRYPTION_KEY },
    ];
    const missingEnv = envChecks.filter((e) => !e.set).map((e) => e.key);

    if (missingEnv.length > 0) {
      checks.push({
        name: "Environment Variables",
        status: "fail",
        message: `Missing: ${missingEnv.join(", ")}`,
      });
    } else {
      checks.push({
        name: "Environment Variables",
        status: "pass",
        message: `All ${envChecks.length} required env vars configured`,
      });
    }

    // ============================================
    // 12. BALANCE CHECK — WOML platform balance
    // ============================================
    try {
      const balance = await stripe.balance.retrieve();
      const available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
      const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;

      checks.push({
        name: "Stripe Balance",
        status: available < 0 ? "warn" : "pass",
        message: `Available: $${available.toFixed(2)} | Pending: $${pending.toFixed(2)}`,
      });
    } catch (err: any) {
      checks.push({
        name: "Stripe Balance",
        status: "warn",
        message: `Could not retrieve balance: ${err.message}`,
      });
    }

    // ============================================
    // 13. WEBHOOK PROCESSING — check for unprocessed events
    // ============================================
    try {
      const processedCount = await sql`SELECT COUNT(*)::int as count FROM processed_webhooks`;
      const recentProcessed = await sql`
        SELECT COUNT(*)::int as count FROM processed_webhooks
        WHERE processed_at > NOW() - INTERVAL '24 hours'
      `;

      checks.push({
        name: "Webhook Processing",
        status: "pass",
        message: `${processedCount[0].count} total events processed, ${recentProcessed[0].count} in last 24h`,
      });
    } catch (err: any) {
      checks.push({
        name: "Webhook Processing",
        status: "warn",
        message: `processed_webhooks table may not exist: ${err.message}`,
        fixable: true,
      });
    }

    // ============================================
    // SUMMARY
    // ============================================
    const failCount = checks.filter((c) => c.status === "fail").length;
    const warnCount = checks.filter((c) => c.status === "warn").length;
    const passCount = checks.filter((c) => c.status === "pass").length;
    const fixableCount = checks.filter((c) => c.fixable).length;

    let overallStatus: "healthy" | "degraded" | "critical";
    if (failCount > 0) overallStatus = "critical";
    else if (warnCount > 0) overallStatus = "degraded";
    else overallStatus = "healthy";

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      summary: { pass: passCount, warn: warnCount, fail: failCount, fixable: fixableCount },
      checks,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "critical", error: error.message, checks: [] },
      { status: 500 }
    );
  }
}

// ============================================
// AUTO-FIX ENDPOINT
// ============================================
export async function POST(request: NextRequest) {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      maxNetworkRetries: 1,
      timeout: 15000,
    });

    const { action } = await request.json();
    const results: string[] = [];

    if (action === "fix_broken_refs") {
      // Clear stripe_account_id for users whose Stripe account no longer exists
      const users = await sql`
        SELECT id, email, stripe_account_id FROM users
        WHERE stripe_account_id IS NOT NULL
      `;

      for (const user of users) {
        try {
          await stripe.accounts.retrieve(user.stripe_account_id);
        } catch {
          await sql`UPDATE users SET stripe_account_id = NULL, stripe_onboarding_complete = false WHERE id = ${user.id}`;
          results.push(`Cleared broken Stripe ref for ${user.email}`);
        }
      }
    }

    if (action === "fix_stuck_processing") {
      // Reset leads stuck in 'processing' for over 2 hours back to 'pending'
      const fixed = await sql`
        UPDATE leads SET payout_status = 'pending'
        WHERE payout_status = 'processing'
        AND submitted_at < NOW() - INTERVAL '2 hours'
        RETURNING id
      `;
      results.push(`Reset ${fixed.length} stuck lead(s) to pending`);
    }

    if (action === "ensure_tables") {
      // Create processed_webhooks table if missing
      await sql`
        CREATE TABLE IF NOT EXISTS processed_webhooks (
          event_id VARCHAR(255) PRIMARY KEY,
          processed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      // Create platform_settings table if missing
      await sql`
        CREATE TABLE IF NOT EXISTS platform_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `;
      results.push("Ensured processed_webhooks and platform_settings tables exist");
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
