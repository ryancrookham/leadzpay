import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTransactionsByUserId, isDatabaseConfigured } from "@/lib/db";

/**
 * Get transactions for the current user
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
        transactions: [],
        message: "Database not configured",
      });
    }

    const transactions = await getTransactionsByUserId(session.user.id, 100);

    // Transform to client-friendly format
    const formattedTransactions = transactions.map((t) => ({
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
