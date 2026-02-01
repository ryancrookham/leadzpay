import { NextResponse } from "next/server";
import { validateSession } from "@/lib/server/session";
import { getSupabaseServerClient, isSupabaseServerConfigured } from "@/lib/db";

/**
 * Get account balance for the current user
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
        balance: {
          accountId: session.userId,
          accountType: session.role,
          availableBalance: 0,
          pendingBalance: 0,
          totalEarnings: 0,
          totalPayouts: 0,
          lastUpdated: new Date().toISOString(),
        },
        message: "Database not configured",
      });
    }

    const supabase = getSupabaseServerClient();

    // Try to get from the account_balances view first
    const { data: viewData } = await supabase
      .from("account_balances")
      .select("*")
      .eq("user_id", session.userId)
      .single();

    if (viewData) {
      return NextResponse.json({
        balance: {
          accountId: session.userId,
          accountType: viewData.account_type || session.role,
          availableBalance: viewData.available_balance || 0,
          pendingBalance: viewData.pending_balance || 0,
          totalEarnings: viewData.total_earnings || 0,
          totalPayouts: viewData.total_payouts || 0,
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    // Calculate balance from transactions if view doesn't exist
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .or(`from_account_id.eq.${session.userId},to_account_id.eq.${session.userId}`)
      .limit(1000);

    let totalEarnings = 0;
    let totalPayouts = 0;
    let pendingBalance = 0;

    for (const t of transactions || []) {
      if (t.to_account_id === session.userId) {
        if (t.status === "completed") {
          totalEarnings += t.net_amount;
        } else if (t.status === "pending") {
          pendingBalance += t.net_amount;
        }
      }
      if (t.from_account_id === session.userId && t.status === "completed") {
        totalPayouts += t.amount;
      }
    }

    return NextResponse.json({
      balance: {
        accountId: session.userId,
        accountType: session.role,
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
