import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { validateSession } from "@/lib/server/session";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db";

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key, {
    apiVersion: "2026-01-28.clover",
  });
}

/**
 * Process a direct transfer/payout to a provider's connected Stripe account
 * This is used for manual payouts or batch payouts
 */
export async function POST(request: NextRequest) {
  try {
    // Validate session - only buyers or admins can initiate payouts
    const session = await validateSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (session.role !== "buyer" && session.role !== "admin") {
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

    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();
      const { data: provider } = await supabase
        .from("users")
        .select("stripe_account_id, stripe_onboarding_complete, display_name")
        .eq("id", providerId)
        .single();

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
      // Fallback for testing - use the provided account ID
      providerStripeAccountId = body.providerStripeAccountId;
    }

    if (!providerStripeAccountId) {
      return NextResponse.json(
        { error: "No Stripe account found for provider" },
        { status: 400 }
      );
    }

    // Convert amount to cents
    const amountInCents = Math.round(amount * 100);

    // Create a transfer to the provider's connected account
    const transfer = await stripe.transfers.create({
      amount: amountInCents,
      currency: "usd",
      destination: providerStripeAccountId,
      metadata: {
        leadId: leadId || "",
        providerId,
        buyerId: session.userId,
        transactionId: transactionId || "",
        type: "lead_payout",
      },
    });

    // Update database records
    if (isSupabaseServerConfigured()) {
      const supabase = getSupabaseServerClient();

      // Update lead payout status
      if (leadId) {
        await supabase
          .from("leads")
          .update({
            stripe_transfer_id: transfer.id,
            payout_status: "completed",
            payout_completed_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }

      // Update or create transaction record
      if (transactionId) {
        await supabase
          .from("transactions")
          .update({
            status: "completed",
            stripe_transfer_id: transfer.id,
            completed_at: new Date().toISOString(),
          })
          .eq("id", transactionId);
      } else {
        // Create new transaction record
        await supabase.from("transactions").insert({
          type: "lead_payout",
          status: "completed",
          amount: amount,
          fee_amount: 0,
          net_amount: amount,
          from_account_id: session.userId,
          to_account_id: providerId,
          lead_id: leadId,
          stripe_transfer_id: transfer.id,
          description: leadId ? `Lead payout for ${leadId}` : "Direct payout",
          completed_at: new Date().toISOString(),
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

    // Check for specific Stripe errors
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
    const session = await validateSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      );
    }

    if (!isSupabaseServerConfigured()) {
      return NextResponse.json({
        payouts: [],
        message: "Database not configured",
      });
    }

    const supabase = getSupabaseServerClient();

    // Get transactions for this user
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`from_account_id.eq.${session.userId},to_account_id.eq.${session.userId}`)
      .eq("type", "lead_payout")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to fetch payouts:", error);
      return NextResponse.json(
        { error: "Failed to fetch payout history" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      payouts: transactions || [],
    });
  } catch (error) {
    console.error("Get payouts error:", error);
    return NextResponse.json(
      { error: "Failed to get payout history" },
      { status: 500 }
    );
  }
}
