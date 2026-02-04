import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTransactionsByUserId, isDatabaseConfigured } from "@/lib/db";

/**
 * Get account balance for the current user
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
        balance: {
          accountId: session.user.id,
          accountType: session.user.role,
          availableBalance: 0,
          pendingBalance: 0,
          totalEarnings: 0,
          totalPayouts: 0,
          lastUpdated: new Date().toISOString(),
        },
        message: "Database not configured",
      });
    }

    // Calculate balance from transactions
    const transactions = await getTransactionsByUserId(session.user.id, 1000);

    let totalEarnings = 0;
    let totalPayouts = 0;
    let pendingBalance = 0;

    for (const t of transactions) {
      if (t.to_account_id === session.user.id) {
        if (t.status === "completed") {
          totalEarnings += t.net_amount;
        } else if (t.status === "pending") {
          pendingBalance += t.net_amount;
        }
      }
      if (t.from_account_id === session.user.id && t.status === "completed") {
        totalPayouts += t.amount;
      }
    }

    return NextResponse.json({
      balance: {
        accountId: session.user.id,
        accountType: session.user.role,
        availableBalance: totalEarnings - totalPayouts,
        pendingBalance,
        totalEarnings,
        totalPayouts,
        lastUpdated: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Get balance error:", error);
    return NextResponse.json(
      { error: "Failed to get balance" },
      { status: 500 }
    );
  }
}
