/**
 * Transaction Ledger for complete financial audit trail
 * Uses Neon PostgreSQL for persistent storage
 */

import { executeSql as sql, isDatabaseConfigured, getTransactionsByUserId, createTransaction, type DbTransaction } from "./db";

export interface Transaction {
  id: string;
  type: "lead_payout" | "policy_commission" | "platform_fee" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "reversed";
  amount: number;
  feeAmount: number;
  netAmount: number;
  currency: "USD";

  // Parties involved
  fromAccount: string | null;
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
    leadId: row.lead_id || undefined,
    connectionId: row.connection_id || undefined,
    stripePaymentId: row.stripe_payment_id || undefined,
    stripeTransferId: row.stripe_transfer_id || undefined,
    description: row.description || "",
    createdAt: row.created_at,
    completedAt: row.completed_at || undefined,
  };
}

/**
 * Server-side Transaction Ledger
 */
class ServerTransactionLedger {
  async getAll(limit: number = 100): Promise<Transaction[]> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    try {
      const result = await sql`
        SELECT * FROM transactions
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return result.map(row => dbToTransaction(row as DbTransaction));
    } catch (error) {
      console.error("Failed to fetch transactions:", error);
      return [];
    }
  }

  async getByAccount(accountId: string, limit: number = 50): Promise<Transaction[]> {
    if (!isDatabaseConfigured()) {
      return [];
    }

    try {
      const result = await getTransactionsByUserId(accountId, limit);
      return result.map(dbToTransaction);
    } catch (error) {
      console.error("Failed to fetch account transactions:", error);
      return [];
    }
  }

  async getById(transactionId: string): Promise<Transaction | null> {
    if (!isDatabaseConfigured()) {
      return null;
    }

    try {
      const result = await sql`
        SELECT * FROM transactions WHERE id = ${transactionId} LIMIT 1
      `;
      if (!result[0]) return null;
      return dbToTransaction(result[0] as DbTransaction);
    } catch (error) {
      console.error("Failed to fetch transaction:", error);
      return null;
    }
  }

  async record(
    transaction: Omit<Transaction, "id" | "createdAt" | "status"> & { status?: Transaction["status"] }
  ): Promise<Transaction | null> {
    if (!isDatabaseConfigured()) {
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

    try {
      const result = await createTransaction({
        type: transaction.type,
        amount: transaction.amount,
        fee_amount: transaction.feeAmount || 0,
        net_amount: transaction.netAmount || transaction.amount,
        from_account_id: transaction.fromAccount || undefined,
        to_account_id: transaction.toAccount || undefined,
        lead_id: transaction.leadId,
        connection_id: transaction.connectionId,
        stripe_payment_id: transaction.stripePaymentId,
        description: transaction.description,
      });
      return dbToTransaction(result);
    } catch (error) {
      console.error("Failed to record transaction:", error);
      return null;
    }
  }

  async complete(transactionId: string): Promise<Transaction | null> {
    if (!isDatabaseConfigured()) {
      return null;
    }

    try {
      const result = await sql`
        UPDATE transactions
        SET status = 'completed', completed_at = NOW()
        WHERE id = ${transactionId}
        RETURNING *
      `;
      if (!result[0]) return null;
      return dbToTransaction(result[0] as DbTransaction);
    } catch (error) {
      console.error("Failed to complete transaction:", error);
      return null;
    }
  }

  async fail(transactionId: string, _reason?: string): Promise<Transaction | null> {
    if (!isDatabaseConfigured()) {
      return null;
    }

    try {
      const result = await sql`
        UPDATE transactions
        SET status = 'failed'
        WHERE id = ${transactionId}
        RETURNING *
      `;
      if (!result[0]) return null;
      return dbToTransaction(result[0] as DbTransaction);
    } catch (error) {
      console.error("Failed to mark transaction as failed:", error);
      return null;
    }
  }

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

    if (!isDatabaseConfigured()) {
      return defaultBalance;
    }

    try {
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
    } catch (error) {
      console.error("Failed to get balance:", error);
      return defaultBalance;
    }
  }
}

// Export singleton instance
export const serverLedger = new ServerTransactionLedger();
export const ledger = serverLedger;

/**
 * Client-side Transaction Ledger
 */
class ClientTransactionLedger {
  private cache: Map<string, { data: Transaction[]; timestamp: number }> = new Map();
  private cacheTimeout = 30000;

  private isCacheValid(key: string): boolean {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return Date.now() - cached.timestamp < this.cacheTimeout;
  }

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

  clearCache() {
    this.cache.clear();
  }
}

export const clientLedger = new ClientTransactionLedger();

// Helper functions
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

export async function recordPolicyCommission(
  providerId: string,
  leadId: string,
  policyNumber: string,
  amount: number
): Promise<Transaction | null> {
  return serverLedger.record({
    type: "policy_commission",
    amount,
    feeAmount: 0,
    netAmount: amount,
    currency: "USD",
    fromAccount: null,
    toAccount: providerId,
    leadId,
    description: `Commission for policy ${policyNumber}`,
    policyNumber,
  });
}

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
    toAccount: null,
    leadId,
    stripePaymentId,
    description: `Platform fee${leadId ? ` for lead ${leadId}` : ""}`,
  });
}
