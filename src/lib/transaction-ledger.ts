// Transaction Ledger for complete financial audit trail

export interface Transaction {
  id: string;
  type: "lead_payout" | "policy_commission" | "platform_fee" | "refund" | "adjustment";
  status: "pending" | "completed" | "failed" | "reversed";
  amount: number;
  currency: "USD";

  // Parties involved
  fromAccount: string;  // "platform" | providerId | receiverId | carrierId
  toAccount: string;

  // Reference data
  leadId?: string;
  policyNumber?: string;
  carrierId?: string;

  // Payment details
  stripePaymentId?: string;
  stripeTransferId?: string;

  // Metadata
  description: string;
  createdAt: string;
  completedAt?: string;
  metadata?: Record<string, unknown>;
}

export interface AccountBalance {
  accountId: string;
  accountType: "provider" | "receiver" | "platform";
  availableBalance: number;
  pendingBalance: number;
  totalEarnings: number;
  totalPayouts: number;
  lastUpdated: string;
}

class TransactionLedger {
  private storageKey = "leadzpay_transactions";
  private balanceKey = "leadzpay_balances";

  // Get all transactions
  getAll(): Transaction[] {
    if (typeof window === "undefined") return [];
    const data = localStorage.getItem(this.storageKey);
    return data ? JSON.parse(data) : [];
  }

  // Get transactions for a specific account
  getByAccount(accountId: string): Transaction[] {
    return this.getAll().filter(
      (t) => t.fromAccount === accountId || t.toAccount === accountId
    );
  }

  // Get transactions by type
  getByType(type: Transaction["type"]): Transaction[] {
    return this.getAll().filter((t) => t.type === type);
  }

  // Get transactions for a date range
  getByDateRange(startDate: Date, endDate: Date): Transaction[] {
    return this.getAll().filter((t) => {
      const date = new Date(t.createdAt);
      return date >= startDate && date <= endDate;
    });
  }

  // Record a new transaction
  record(transaction: Omit<Transaction, "id" | "createdAt" | "status">): Transaction {
    const newTransaction: Transaction = {
      ...transaction,
      id: `txn_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    const transactions = this.getAll();
    transactions.unshift(newTransaction);
    localStorage.setItem(this.storageKey, JSON.stringify(transactions));

    // Update account balances
    this.updateBalances(newTransaction);

    return newTransaction;
  }

  // Complete a transaction
  complete(transactionId: string): Transaction | null {
    const transactions = this.getAll();
    const index = transactions.findIndex((t) => t.id === transactionId);

    if (index === -1) return null;

    transactions[index] = {
      ...transactions[index],
      status: "completed",
      completedAt: new Date().toISOString(),
    };

    localStorage.setItem(this.storageKey, JSON.stringify(transactions));
    return transactions[index];
  }

  // Reverse a transaction
  reverse(transactionId: string, reason: string): Transaction | null {
    const original = this.getAll().find((t) => t.id === transactionId);
    if (!original) return null;

    // Create reversal transaction
    const reversal = this.record({
      type: "adjustment",
      amount: -original.amount,
      currency: "USD",
      fromAccount: original.toAccount,
      toAccount: original.fromAccount,
      leadId: original.leadId,
      description: `Reversal: ${reason}`,
      metadata: { originalTransactionId: transactionId },
    });

    // Mark original as reversed
    const transactions = this.getAll();
    const index = transactions.findIndex((t) => t.id === transactionId);
    if (index !== -1) {
      transactions[index].status = "reversed";
      localStorage.setItem(this.storageKey, JSON.stringify(transactions));
    }

    return reversal;
  }

  // Get account balance
  getBalance(accountId: string): AccountBalance {
    if (typeof window === "undefined") {
      return {
        accountId,
        accountType: "provider",
        availableBalance: 0,
        pendingBalance: 0,
        totalEarnings: 0,
        totalPayouts: 0,
        lastUpdated: new Date().toISOString(),
      };
    }

    const balances = JSON.parse(localStorage.getItem(this.balanceKey) || "{}");
    return (
      balances[accountId] || {
        accountId,
        accountType: "provider",
        availableBalance: 0,
        pendingBalance: 0,
        totalEarnings: 0,
        totalPayouts: 0,
        lastUpdated: new Date().toISOString(),
      }
    );
  }

  // Update balances after transaction
  private updateBalances(transaction: Transaction) {
    if (typeof window === "undefined") return;

    const balances = JSON.parse(localStorage.getItem(this.balanceKey) || "{}");

    // Update sender balance
    if (transaction.fromAccount !== "platform") {
      if (!balances[transaction.fromAccount]) {
        balances[transaction.fromAccount] = this.createEmptyBalance(transaction.fromAccount);
      }
      balances[transaction.fromAccount].totalPayouts += transaction.amount;
      balances[transaction.fromAccount].availableBalance -= transaction.amount;
      balances[transaction.fromAccount].lastUpdated = new Date().toISOString();
    }

    // Update receiver balance
    if (transaction.toAccount !== "platform") {
      if (!balances[transaction.toAccount]) {
        balances[transaction.toAccount] = this.createEmptyBalance(transaction.toAccount);
      }
      if (transaction.status === "pending") {
        balances[transaction.toAccount].pendingBalance += transaction.amount;
      } else {
        balances[transaction.toAccount].availableBalance += transaction.amount;
      }
      balances[transaction.toAccount].totalEarnings += transaction.amount;
      balances[transaction.toAccount].lastUpdated = new Date().toISOString();
    }

    localStorage.setItem(this.balanceKey, JSON.stringify(balances));
  }

  private createEmptyBalance(accountId: string): AccountBalance {
    return {
      accountId,
      accountType: "provider",
      availableBalance: 0,
      pendingBalance: 0,
      totalEarnings: 0,
      totalPayouts: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Generate financial report
  generateReport(startDate: Date, endDate: Date) {
    const transactions = this.getByDateRange(startDate, endDate);

    const report = {
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
      summary: {
        totalTransactions: transactions.length,
        totalVolume: transactions
          .filter((t) => t.status === "completed")
          .reduce((sum, t) => sum + Math.abs(t.amount), 0),
        payouts: transactions
          .filter((t) => t.type === "lead_payout" && t.status === "completed")
          .reduce((sum, t) => sum + t.amount, 0),
        commissions: transactions
          .filter((t) => t.type === "policy_commission" && t.status === "completed")
          .reduce((sum, t) => sum + t.amount, 0),
        platformFees: transactions
          .filter((t) => t.type === "platform_fee" && t.status === "completed")
          .reduce((sum, t) => sum + t.amount, 0),
        refunds: transactions
          .filter((t) => t.type === "refund" && t.status === "completed")
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

  // Clear all data
  clear() {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem(this.balanceKey);
  }
}

// Export singleton instance
export const ledger = new TransactionLedger();

// Helper to record a lead payout
export function recordLeadPayout(
  providerId: string,
  receiverId: string,
  leadId: string,
  amount: number,
  stripePaymentId?: string
) {
  return ledger.record({
    type: "lead_payout",
    amount,
    currency: "USD",
    fromAccount: receiverId,
    toAccount: providerId,
    leadId,
    stripePaymentId,
    description: `Lead payout for ${leadId}`,
  });
}

// Helper to record policy commission
export function recordPolicyCommission(
  providerId: string,
  policyNumber: string,
  carrierId: string,
  amount: number
) {
  return ledger.record({
    type: "policy_commission",
    amount,
    currency: "USD",
    fromAccount: carrierId,
    toAccount: providerId,
    policyNumber,
    carrierId,
    description: `Commission for policy ${policyNumber}`,
  });
}
