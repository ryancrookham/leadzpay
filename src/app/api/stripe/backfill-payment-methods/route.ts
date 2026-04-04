import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { updatePaymentMethodId } from "@/lib/db";
import { neon } from "@neondatabase/serverless";

/**
 * POST /api/stripe/backfill-payment-methods
 * Admin-only endpoint that finds buyers with stripe_customer_id but no
 * stripe_default_payment_method, fetches their default PM from Stripe, and saves it.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    if ((session.user as any).role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const sql = neon(process.env.DATABASE_URL!);

    // Find buyers with a Stripe customer but no saved payment method
    const buyers = await sql`
      SELECT id, stripe_customer_id
      FROM users
      WHERE role = 'buyer'
        AND stripe_customer_id IS NOT NULL
        AND (stripe_default_payment_method IS NULL OR stripe_default_payment_method = '')
    `;

    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const buyer of buyers) {
      try {
        const customer = await stripe.customers.retrieve(buyer.stripe_customer_id);
        if (customer.deleted) {
          skipped++;
          continue;
        }

        const defaultPm = customer.invoice_settings?.default_payment_method;
        if (defaultPm) {
          const pmId = typeof defaultPm === "string" ? defaultPm : defaultPm.id;
          await updatePaymentMethodId(buyer.id, pmId);
          updated++;
        } else {
          // Try listing payment methods as fallback
          const methods = await stripe.paymentMethods.list({
            customer: buyer.stripe_customer_id,
            limit: 1,
          });
          if (methods.data.length > 0) {
            await updatePaymentMethodId(buyer.id, methods.data[0].id);
            // Also set as default on Stripe
            await stripe.customers.update(buyer.stripe_customer_id, {
              invoice_settings: { default_payment_method: methods.data[0].id },
            });
            updated++;
          } else {
            skipped++;
          }
        }
      } catch (err: any) {
        errors.push(`${buyer.id}: ${err?.message}`);
      }
    }

    console.log(`[backfill-payment-methods] ${updated} updated, ${skipped} skipped, ${errors.length} errors`);

    return NextResponse.json({
      total: buyers.length,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error("[backfill-payment-methods] error:", error?.message);
    return NextResponse.json({ error: error?.message || "Backfill failed" }, { status: 500 });
  }
}
