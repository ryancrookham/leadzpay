// Connection and Agreement Types

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

// Payment terms set by the Lead Receiver (Buyer)
export interface PaymentTerms {
  ratePerLead: number;           // $ per lead
  timing: PaymentTiming;
  minimumPayoutThreshold?: number; // Minimum $ before payout (optional)
  bonusRate?: number;            // Bonus $ for converted leads (optional)
}

// Full contract terms - set entirely by the Buyer
export interface ContractTerms {
  paymentTerms: PaymentTerms;
  leadTypes: string[];           // Types of leads accepted (e.g., "auto", "home")
  exclusivity: boolean;          // Is provider exclusive to this buyer?
  notes?: string;                // Any additional notes from buyer
  terminationNoticeDays: number; // Days notice required to terminate
}

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
  };
}

// Default payment terms for buyers to start with
export function getDefaultPaymentTerms(): PaymentTerms {
  return {
    ratePerLead: 50,
    timing: "per_lead",
  };
}

// Default contract terms
export function getDefaultContractTerms(): ContractTerms {
  return {
    paymentTerms: getDefaultPaymentTerms(),
    leadTypes: ["auto"],
    exclusivity: false,
    terminationNoticeDays: 7,
  };
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
