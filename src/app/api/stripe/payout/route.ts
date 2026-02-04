import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@/lib/auth";
import { executeSql as sql, isDatabaseConfigured, getUserById, getTransactionsByUserId, createTransaction } from "@/lib/db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Process a direct transfer/payout to a provider's connected Stripe account
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.user.role !== "buyer" && session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Only buyers or admins can initiate payouts" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { amount, leadId, providerId, transactionId } = body;

    if (!amount || !providerId) {
      return NextResponse.json(
        { error: "Amount and providerId are required" },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    if (!stripe) {
      return NextResponse.json({
        success: true,
        simulated: true,
        message: `Payout of $${amount} to provider simulated`,
        providerId,
        leadId,
      });
    }

    // Get provider's Stripe account ID
    let providerStripeAccountId: string | null = null;

    if (isDatabaseConfigured()) {
      const provider = await getUserById(providerId);

      if (!provider?.stripe_account_id) {
        return NextResponse.json(
          { error: "Provider has not connected a Stripe account" },
          { status: 400 }
        );
      }

      if (!provider?.stripe_onboarding_complete) {
        return NextResponse.json(
          { error: "Provider has not completed Stripe onboarding" },
          { status: 400 }
        );
      }

      providerStripeAccountId = provider.stripe_account_id;
    } else {
      providerStripeAccountId = body.providerStripeAccountId;
    }

    if (!providerStripeAccountId) {
      return NextResponse.json(
        { error: "No Stripe account found for provider" },
        { status: 400 }
      );
    }

    const amountInCents = Math.round(amount * 100);

    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: "usd",
      destination: providerStripeAccountId,
      metadata: {
        leadId: leadId || "",
        providerId,
        buyerId: session.user.id,
        transactionId: transactionId || "",
        type: "lead_payout",
      },
    });

    // Update database records
    if (isDatabaseConfigured()) {
      if (leadId) {
        await sql`
          UPDATE leads
          SET stripe_transfer_id = ${transfer.id},
              payout_status = 'completed',
              payout_completed_at = NOW()
          WHERE id = ${leadId}
        `;
      }

      if (transactionId) {
        await sql`
          UPDATE transactions
          SET status = 'completed',
              stripe_transfer_id = ${transfer.id},
              completed_at = NOW()
          WHERE id = ${transactionId}
        `;
      } else {
        await createTransaction({
          type: "lead_payout",
          amount: amount,
          fee_amount: 0,
          net_amount: amount,
          from_account_id: session.user.id,
          to_account_id: providerId,
          lead_id: leadId,
          stripe_payment_id: transfer.id,
          description: leadId ? `Lead payout for ${leadId}` : "Direct payout",
        });
      }
    }

    return NextResponse.json({
      success: true,
      transferId: transfer.id,
      amount: amount,
      amountCents: transfer.amount,
      destination: providerStripeAccountId,
    });
  } catch (error) {
    console.error("Payout error:", error);

    if (error instanceof Stripe.errors.StripeError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Payout failed" },
      { status: 500 }
    );
  }
}

/**
 * Get payout history for the current user
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!isDatabaseConfigured()) {
      return NextResponse.json({
        payouts: [],
        message: "Database not configured",
      });
    }

    const transactions = await getTransactionsByUserId(session.user.id, 50);
    const payouts = transactions.filter(t => t.type === "lead_payout");

    return NextResponse.json({
      payouts,
    });
  } catch (error) {
    console.error("Get payouts error:", error);
    return NextResponse.json(
      { error: "Failed to get payout history" },
      { status: 500 }
    );
  }
}
