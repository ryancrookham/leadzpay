// Connection and Agreement Types
// LEGAL COMPLIANCE: All payments are per-lead, not per-customer/conversion

export type ConnectionStatus =
  | "pending_buyer_review"  // Provider requested, waiting for buyer to set terms
  | "pending_provider_accept" // Buyer set terms, waiting for provider to accept/decline
  | "active"                // Both parties agreed, connection is live
  | "declined_by_provider"  // Provider declined the terms
  | "rejected_by_buyer"     // Buyer rejected the connection request
  | "terminated";           // Connection was ended

export type PaymentTiming =
  | "per_lead"    // Paid immediately per lead
  | "weekly"      // Weekly batch payment
  | "biweekly"    // Bi-weekly batch payment
  | "monthly";    // Monthly batch payment

// Payment structure type - MUST be per_lead for legal compliance
export type PaymentStructure = "per_lead"; // Only per-lead payments allowed

// Payment terms set by the Lead Receiver (Buyer)
// IMPORTANT: Payments are ALWAYS per qualified lead submitted, NOT per conversion/sale
export interface PaymentTerms {
  ratePerLead: number;           // $ per qualified lead (NOT per conversion)
  timing: PaymentTiming;         // When payments are processed
  minimumPayoutThreshold?: number; // Minimum $ before payout (optional)
  paymentStructure: PaymentStructure; // Always "per_lead" for compliance
  // Note: bonusRate removed - paying per conversion creates monopoly risk
}

// Lead cap settings - protects buyers from unlimited lead obligations
export interface LeadCaps {
  weeklyLimit?: number;          // Max leads per week (undefined = unlimited)
  monthlyLimit?: number;         // Max leads per month (undefined = unlimited)
  pauseWhenCapReached: boolean;  // Auto-pause connection when cap reached vs reject new leads
}

// Full contract terms - set entirely by the Buyer
export interface ContractTerms {
  paymentTerms: PaymentTerms;
  leadTypes: string[];           // Types of leads accepted (e.g., "auto", "home")
  exclusivity: boolean;          // Is provider exclusive to this buyer?
  notes?: string;                // Any additional notes from buyer
  terminationNoticeDays: number; // Days notice required to terminate

  // Lead volume caps - buyer protection
  leadCaps?: LeadCaps;           // Optional caps on lead volume

  // Compliance fields
  licensedStates: string[];      // States where buyer is licensed to receive leads
  complianceAcknowledged: boolean; // Buyer acknowledged per-lead payment structure
  agreementVersion: string;      // Version of terms for legal tracking
}

// Legal compliance constants
export const COMPLIANCE = {
  // Per-lead payment is REQUIRED - no conversion-based payments
  paymentStructure: "per_lead" as PaymentStructure,

  // Current agreement version
  currentAgreementVersion: "1.0.0",

  // Anti-monopoly: Maximum rate to prevent buyer from outbidding everyone
  maxRatePerLead: 500, // $500 max per lead
  minRatePerLead: 5,   // $5 minimum per lead

  // Fair market provisions
  fairMarketProvisions: [
    "Payment is per qualified lead submitted, not per conversion or policy sale",
    "Lead providers are paid regardless of whether the customer converts",
    "Buyers cannot require exclusive arrangements that prevent fair competition",
    "All fees and rates are transparent and disclosed upfront",
    "Either party can terminate with proper notice",
  ],
};

// Connection request from Provider to Buyer
export interface ConnectionRequest {
  id: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  buyerId: string;
  buyerBusinessName: string;
  message?: string;              // Optional message from provider
  status: "pending" | "terms_set" | "accepted" | "declined" | "rejected";
  proposedTerms?: ContractTerms; // Terms set by buyer (once reviewed)
  createdAt: string;
  reviewedAt?: string;           // When buyer set terms
  respondedAt?: string;          // When provider accepted/declined
}

// Active connection between Provider and Buyer
export interface Connection {
  id: string;
  providerId: string;
  providerName: string;
  providerEmail: string;
  buyerId: string;
  buyerBusinessName: string;
  status: ConnectionStatus;
  terms: ContractTerms;

  // Timestamps
  requestedAt: string;
  termsSetAt: string;
  acceptedAt: string;
  terminatedAt?: string;
  terminatedBy?: "buyer" | "provider";
  terminationReason?: string;

  // Stats for this connection
  stats: {
    totalLeads: number;
    totalPaid: number;
    lastLeadAt?: string;
    lastPaymentAt?: string;
    // Lead cap tracking
    leadsThisWeek: number;
    leadsThisMonth: number;
    weekStartDate: string;    // ISO date of current week start (Monday)
    monthStartDate: string;   // ISO date of current month start
  };
}

// Default payment terms for buyers to start with
export function getDefaultPaymentTerms(): PaymentTerms {
  return {
    ratePerLead: 50,
    timing: "per_lead",
    paymentStructure: "per_lead", // Required for compliance
  };
}

// Default contract terms
export function getDefaultContractTerms(licensedStates: string[] = []): ContractTerms {
  return {
    paymentTerms: getDefaultPaymentTerms(),
    leadTypes: ["auto"],
    exclusivity: false,
    terminationNoticeDays: 7,
    licensedStates,
    complianceAcknowledged: false,
    agreementVersion: COMPLIANCE.currentAgreementVersion,
  };
}

// Validate rate is within fair market bounds
export function validateLeadRate(rate: number): { valid: boolean; message?: string } {
  if (rate < COMPLIANCE.minRatePerLead) {
    return { valid: false, message: `Minimum rate is $${COMPLIANCE.minRatePerLead} per lead` };
  }
  if (rate > COMPLIANCE.maxRatePerLead) {
    return { valid: false, message: `Maximum rate is $${COMPLIANCE.maxRatePerLead} per lead to ensure fair market competition` };
  }
  return { valid: true };
}

// Helper to format payment timing for display
export function formatPaymentTiming(timing: PaymentTiming): string {
  const labels: Record<PaymentTiming, string> = {
    per_lead: "Per Lead",
    weekly: "Weekly",
    biweekly: "Bi-weekly",
    monthly: "Monthly",
  };
  return labels[timing];
}

// Get the start of the current week (Monday)
export function getWeekStartDate(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  const monday = new Date(now.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().split('T')[0];
}

// Get the start of the current month
export function getMonthStartDate(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

// Check if lead caps have been reached for a connection
export function checkLeadCaps(connection: Connection): {
  weeklyCapReached: boolean;
  monthlyCapReached: boolean;
  weeklyRemaining: number | null;
  monthlyRemaining: number | null;
  canSubmitLead: boolean;
  message?: string;
} {
  const { terms, stats } = connection;
  const caps = terms.leadCaps;

  // No caps set = unlimited
  if (!caps) {
    return {
      weeklyCapReached: false,
      monthlyCapReached: false,
      weeklyRemaining: null,
      monthlyRemaining: null,
      canSubmitLead: true,
    };
  }

  // Reset counts if we're in a new week/month
  const currentWeekStart = getWeekStartDate();
  const currentMonthStart = getMonthStartDate();

  const leadsThisWeek = stats.weekStartDate === currentWeekStart ? stats.leadsThisWeek : 0;
  const leadsThisMonth = stats.monthStartDate === currentMonthStart ? stats.leadsThisMonth : 0;

  const weeklyCapReached = caps.weeklyLimit !== undefined && leadsThisWeek >= caps.weeklyLimit;
  const monthlyCapReached = caps.monthlyLimit !== undefined && leadsThisMonth >= caps.monthlyLimit;

  const weeklyRemaining = caps.weeklyLimit !== undefined ? Math.max(0, caps.weeklyLimit - leadsThisWeek) : null;
  const monthlyRemaining = caps.monthlyLimit !== undefined ? Math.max(0, caps.monthlyLimit - leadsThisMonth) : null;

  const canSubmitLead = !weeklyCapReached && !monthlyCapReached;

  let message: string | undefined;
  if (weeklyCapReached && monthlyCapReached) {
    message = "Both weekly and monthly lead caps have been reached";
  } else if (weeklyCapReached) {
    message = `Weekly lead cap reached (${caps.weeklyLimit} leads). Resets Monday.`;
  } else if (monthlyCapReached) {
    message = `Monthly lead cap reached (${caps.monthlyLimit} leads). Resets next month.`;
  }

  return {
    weeklyCapReached,
    monthlyCapReached,
    weeklyRemaining,
    monthlyRemaining,
    canSubmitLead,
    message,
  };
}

// Format lead cap status for display
export function formatLeadCapStatus(connection: Connection): string {
  const caps = connection.terms.leadCaps;

  if (!caps) return "Unlimited";

  const parts: string[] = [];

  if (caps.weeklyLimit !== undefined) {
    const used = connection.stats.leadsThisWeek || 0;
    parts.push(`${used}/${caps.weeklyLimit} weekly`);
  }

  if (caps.monthlyLimit !== undefined) {
    const used = connection.stats.leadsThisMonth || 0;
    parts.push(`${used}/${caps.monthlyLimit} monthly`);
  }

  if (parts.length === 0) return "Unlimited";

  return parts.join(" • ");
}
