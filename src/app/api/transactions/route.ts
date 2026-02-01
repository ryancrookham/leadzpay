import { NextResponse } from "next/server";
import { validateSession } from "@/lib/server/session";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db";

/**
 * Get transactions for the current user
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
        transactions: [],
        message: "Database not configured",
      });
    }

    const supabase = getSupabaseServerClient();

    // Get transactions where user is sender or receiver
    const { data: transactions, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`from_account_id.eq.${session.userId},to_account_id.eq.${session.userId}`)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Failed to fetch transactions:", error);
      return NextResponse.json(
        { error: "Failed to fetch transactions" },
        { status: 500 }
      );
    }

    // Transform to client-friendly format
    const formattedTransactions = (transactions || []).map((t) => ({
      id: t.id,
      type: t.type,
      status: t.status,
      amount: t.amount,
      feeAmount: t.fee_amount,
      netAmount: t.net_amount,
      currency: "USD",
      fromAccount: t.from_account_id,
      toAccount: t.to_account_id,
      leadId: t.lead_id,
      connectionId: t.connection_id,
      stripePaymentId: t.stripe_payment_id,
      stripeTransferId: t.stripe_transfer_id,
      description: t.description,
      createdAt: t.created_at,
      completedAt: t.completed_at,
    }));

    return NextResponse.json({
      transactions: formattedTransactions,
    });
  } catch (error) {
    console.error("Get transactions error:", error);
    return NextResponse.json(
      { error: "Failed to get transactions" },
      { status: 500 }
    );
  }
}
