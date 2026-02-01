/**
 * Transaction Ledger for complete financial audit trail
 *
 * This module provides both server-side (Supabase) and client-side (API) access
 * to the transaction ledger. Server-side operations write directly to the database,
 * while client-side operations go through API endpoints.
 */

import { getSupabaseServerClient, isSupabaseServerConfigured, DbTransaction } from "./db";

export interface Transaction {
  id: string;
  type: "lead_payout" | "policy_commission" | "platform_fee" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "reversed";
  amount: number;
  feeAmount: number;
  netAmount: number;
  currency: "USD";

  // Parties involved
  fromAccount: string | null; // null for platform-initiated
  toAccount: string | null;

  // Reference data
  leadId?: string;
  connectionId?: string;
  policyNumber?: string;

  // Payment details
  stripePaymentId?: string;
  stripeTransferId?: string;
  stripePayoutId?: string;

  // Metadata
  description: string;
  createdAt: string;
  completedAt?: string;
  reversedAt?: string;
  reversalReason?: string;
  reversalTransactionId?: string;
  metadata?: Record<string, unknown>;
}

export interface AccountBalance {
  accountId: string;
  accountType: "provider" | "buyer" | "admin";
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  totalPayouts: number;
  lastUpdated: string;
}

// Convert database row to Transaction interface
function dbToTransaction(row: DbTransaction): Transaction {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    amount: row.amount,
    feeAmount: row.fee_amount,
    netAmount: row.net_amount,
    currency: "USD",
    fromAccount: row.from_account_id || null,
    toAccount: row.to_account_id || null,
    leadId: row.lead_id,
    connectionId: row.connection_id,
    stripePaymentId: row.stripe_payment_id,
    stripeTransferId: row.stripe_transfer_id,
    stripePayoutId: row.stripe_payout_id,
    description: row.description || "",
    createdAt: row.created_at,
    completedAt: row.completed_at,
    reversedAt: row.reversed_at,
    reversalReason: row.reversal_reason,
    reversalTransactionId: row.reversal_transaction_id,
    metadata: row.metadata as Record<string, unknown>,
  };
}

// Convert Transaction to database insert format
function transactionToDb(
  transaction: Omit<Transaction, "id" | "createdAt">
): Omit<DbTransaction, "id" | "created_at"> {
  return {
    type: transaction.type,
    status: transaction.status,
    amount: transaction.amount,
    fee_amount: transaction.feeAmount,
    net_amount: transaction.netAmount,
    from_account_id: transaction.fromAccount || undefined,
    to_account_id: transaction.toAccount || undefined,
    lead_id: transaction.leadId,
    connection_id: transaction.connectionId,
    stripe_payment_id: transaction.stripePaymentId,
    stripe_transfer_id: transaction.stripeTransferId,
    stripe_payout_id: transaction.stripePayoutId,
    description: transaction.description,
    completed_at: transaction.completedAt,
    reversed_at: transaction.reversedAt,
    reversal_reason: transaction.reversalReason,
    reversal_transaction_id: transaction.reversalTransactionId,
    metadata: transaction.metadata,
  };
}

/**
 * Server-side Transaction Ledger
 * Uses Supabase for persistent storage
 */
class ServerTransactionLedger {
  // Get all transactions (with optional limit)
  async getAll(limit: number = 100): Promise<Transaction[]> {
    if (!isSupabaseServerConfigured()) {
      return [];
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch transactions:", error);
      return [];
    }

    return (data || []).map(dbToTransaction);
  }

  // Get transactions for a specific account
  async getByAccount(accountId: string, limit: number = 50): Promise<Transaction[]> {
    if (!isSupabaseServerConfigured()) {
      return [];
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch account transactions:", error);
      return [];
    }

    return (data || []).map(dbToTransaction);
  }

  // Get transactions by type
  async getByType(type: Transaction["type"], limit: number = 50): Promise<Transaction[]> {
    if (!isSupabaseServerConfigured()) {
      return [];
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("type", type)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch transactions by type:", error);
      return [];
    }

    return (data || []).map(dbToTransaction);
  }

  // Get transactions for a date range
  async getByDateRange(
    startDate: Date,
    endDate: Date,
    limit: number = 100
  ): Promise<Transaction[]> {
    if (!isSupabaseServerConfigured()) {
      return [];
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("Failed to fetch transactions by date range:", error);
      return [];
    }

    return (data || []).map(dbToTransaction);
  }

  // Get transaction by ID
  async getById(transactionId: string): Promise<Transaction | null> {
    if (!isSupabaseServerConfigured()) {
      return null;
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (error || !data) {
      return null;
    }

    return dbToTransaction(data);
  }

  // Record a new transaction
  async record(
    transaction: Omit<Transaction, "id" | "createdAt" | "status"> & { status?: Transaction["status"] }
  ): Promise<Transaction | null> {
    if (!isSupabaseServerConfigured()) {
      // Fallback: return simulated transaction
      return {
        ...transaction,
        id: `txn_sim_${Date.now()}`,
        status: transaction.status || "pending",
        createdAt: new Date().toISOString(),
        feeAmount: transaction.feeAmount || 0,
        netAmount: transaction.netAmount || transaction.amount,
        currency: "USD",
        fromAccount: transaction.fromAccount || null,
        toAccount: transaction.toAccount || null,
        description: transaction.description || "",
      };
    }

    const supabase = getSupabaseServerClient();
    const dbData = transactionToDb({
      ...transaction,
      status: transaction.status || "pending",
      feeAmount: transaction.feeAmount || 0,
      netAmount: transaction.netAmount || transaction.amount,
    });

    const { data, error } = await supabase
      .from("transactions")
      .insert(dbData)
      .select()
      .single();

    if (error) {
      console.error("Failed to record transaction:", error);
      return null;
    }

    return dbToTransaction(data);
  }

  // Complete a transaction
  async complete(transactionId: string): Promise<Transaction | null> {
    if (!isSupabaseServerConfigured()) {
      return null;
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", transactionId)
      .select()
      .single();

    if (error) {
      console.error("Failed to complete transaction:", error);
      return null;
    }

    return dbToTransaction(data);
  }

  // Mark transaction as failed
  async fail(transactionId: string, reason?: string): Promise<Transaction | null> {
    if (!isSupabaseServerConfigured()) {
      return null;
    }

    const supabase = getSupabaseServerClient();
    const { data, error } = await supabase
      .from("transactions")
      .update({
        status: "failed",
        reversal_reason: reason,
      })
      .eq("id", transactionId)
      .select()
      .single();

    if (error) {
      console.error("Failed to mark transaction as failed:", error);
      return null;
    }

    return dbToTransaction(data);
  }

  // Reverse a transaction
  async reverse(transactionId: string, reason: string): Promise<Transaction | null> {
    if (!isSupabaseServerConfigured()) {
      return null;
    }

    const supabase = getSupabaseServerClient();

    // Get original transaction
    const original = await this.getById(transactionId);
    if (!original) {
      return null;
    }

    // Create reversal transaction
    const reversal = await this.record({
      type: "adjustment",
      amount: -original.amount,
      feeAmount: 0,
      netAmount: -original.amount,
      currency: "USD",
      fromAccount: original.toAccount,
      toAccount: original.fromAccount,
      leadId: original.leadId,
      connectionId: original.connectionId,
      description: `Reversal: ${reason}`,
      metadata: { originalTransactionId: transactionId },
    });

    if (!reversal) {
      return null;
    }

    // Mark original as reversed
    await supabase
      .from("transactions")
      .update({
        status: "reversed",
        reversed_at: new Date().toISOString(),
        reversal_reason: reason,
        reversal_transaction_id: reversal.id,
      })
      .eq("id", transactionId);

    return reversal;
  }

  // Get account balance from view
  async getBalance(accountId: string): Promise<AccountBalance> {
    const defaultBalance: AccountBalance = {
      accountId,
      accountType: "provider",
      availableBalance: 0,
      pendingBalance: 0,
      totalEarnings: 0,
      totalPayouts: 0,
      lastUpdated: new Date().toISOString(),
    };

    if (!isSupabaseServerConfigured()) {
      return defaultBalance;
    }

    const supabase = getSupabaseServerClient();

    // Try to get from the view first
    const { data: viewData } = await supabase
      .from("account_balances")
      .select("*")
      .eq("user_id", accountId)
      .single();

    if (viewData) {
      return {
        accountId,
        accountType: viewData.account_type || "provider",
        availableBalance: viewData.available_balance || 0,
        pendingBalance: viewData.pending_balance || 0,
        totalEarnings: viewData.total_earnings || 0,
        totalPayouts: viewData.total_payouts || 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    // Calculate from transactions
    const transactions = await this.getByAccount(accountId, 1000);

    let totalEarnings = 0;
    let totalPayouts = 0;
    let pendingBalance = 0;

    for (const t of transactions) {
      if (t.toAccount === accountId) {
        if (t.status === "completed") {
          totalEarnings += t.netAmount;
        } else if (t.status === "pending") {
          pendingBalance += t.netAmount;
        }
      }
      if (t.fromAccount === accountId && t.status === "completed") {
        totalPayouts += t.amount;
      }
    }

    return {
      accountId,
      accountType: "provider",
      availableBalance: totalEarnings - totalPayouts,
      pendingBalance,
      totalEarnings,
      totalPayouts,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Generate financial report
  async generateReport(startDate: Date, endDate: Date) {
    const transactions = await this.getByDateRange(startDate, endDate, 10000);

    const completedTransactions = transactions.filter((t) => t.status === "completed");

    const report = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: {
        totalTransactions: transactions.length,
        totalVolume: completedTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0),
        totalFees: completedTransactions.reduce((sum, t) => sum + t.feeAmount, 0),
        payouts: completedTransactions
          .filter((t) => t.type === "lead_payout")
          .reduce((sum, t) => sum + t.amount, 0),
        commissions: completedTransactions
          .filter((t) => t.type === "policy_commission")
          .reduce((sum, t) => sum + t.amount, 0),
        platformFees: completedTransactions
          .filter((t) => t.type === "platform_fee")
          .reduce((sum, t) => sum + t.amount, 0),
        refunds: completedTransactions
          .filter((t) => t.type === "refund")
          .reduce((sum, t) => sum + t.amount, 0),
      },
      byStatus: {
        completed: transactions.filter((t) => t.status === "completed").length,
        pending: transactions.filter((t) => t.status === "pending").length,
        failed: transactions.filter((t) => t.status === "failed").length,
        reversed: transactions.filter((t) => t.status === "reversed").length,
      },
      transactions,
    };

    return report;
  }
}

// Export singleton instance for server-side use
export const serverLedger = new ServerTransactionLedger();

/**
 * Client-side Transaction Ledger
 * Fetches data via API endpoints (read-only from client)
 */
class ClientTransactionLedger {
  private cache: Map<string, { data: Transaction[]; timestamp: number }> = new Map();
  private cacheTimeout = 30000; // 30 seconds

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.cacheTimeout;
  }

  // Get transactions for current user
  async getMyTransactions(): Promise<Transaction[]> {
    const cacheKey = "my_transactions";
    if (this.isCacheValid(cacheKey)) {
      return this.cache.get(cacheKey)!.data;
    }

    try {
      const response = await fetch("/api/transactions");
      if (!response.ok) {
        throw new Error("Failed to fetch transactions");
      }
      const data = await response.json();
      const transactions = data.transactions || [];
      this.cache.set(cacheKey, { data: transactions, timestamp: Date.now() });
      return transactions;
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      return [];
    }
  }

  // Get balance for current user
  async getMyBalance(): Promise<AccountBalance | null> {
    try {
      const response = await fetch("/api/transactions/balance");
      if (!response.ok) {
        throw new Error("Failed to fetch balance");
      }
      const data = await response.json();
      return data.balance || null;
    } catch (error) {
      console.error("Failed to fetch balance:", error);
      return null;
    }
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }
}

// Export singleton instance for client-side use
export const clientLedger = new ClientTransactionLedger();

// Legacy exports for backward compatibility
export const ledger = serverLedger;

// Helper to record a lead payout (server-side only)
// No platform fee - provider receives 100% of the payment
export async function recordLeadPayout(
  providerId: string,
  buyerId: string,
  leadId: string,
  amount: number,
  connectionId?: string,
  stripePaymentId?: string,
  stripeTransferId?: string
): Promise<Transaction | null> {
  return serverLedger.record({
    type: "lead_payout",
    amount,
    feeAmount: 0,
    netAmount: amount,
    currency: "USD",
    fromAccount: buyerId,
    toAccount: providerId,
    leadId,
    connectionId,
    stripePaymentId,
    stripeTransferId,
    description: `Lead payout for ${leadId}`,
  });
}

// Helper to record policy commission (server-side only)
export async function recordPolicyCommission(
  providerId: string,
  leadId: string,
  policyNumber: string,
  amount: number
): Promise<Transaction | null> {
  // Commission has no platform fee
  return serverLedger.record({
    type: "policy_commission",
    amount,
    feeAmount: 0,
    netAmount: amount,
    currency: "USD",
    fromAccount: null, // From carrier/external
    toAccount: providerId,
    leadId,
    description: `Commission for policy ${policyNumber}`,
    metadata: { policyNumber },
  });
}

// Helper to record platform fee (server-side only)
export async function recordPlatformFee(
  fromAccount: string,
  amount: number,
  leadId?: string,
  stripePaymentId?: string
): Promise<Transaction | null> {
  return serverLedger.record({
    type: "platform_fee",
    amount,
    feeAmount: 0,
    netAmount: amount,
    currency: "USD",
    fromAccount,
    toAccount: null, // To platform
    leadId,
    stripePaymentId,
    description: `Platform fee${leadId ? ` for lead ${leadId}` : ""}`,
  });
}
