// Payment method types and fee structures

export type PaymentMethodType =
  | "ach_bank"
  | "debit_card"
  | "credit_card"
  | "apple_pay"
  | "google_pay"
  | "venmo"
  | "paypal";

export interface PaymentMethod {
  id: PaymentMethodType;
  name: string;
  icon: string;
  description: string;
  processingTime: string;
  feePercent: number;
  feeFixed: number;
  feeCap?: number; // Max fee (for ACH)
  recommended?: boolean;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  {
    id: "ach_bank",
    name: "Bank Transfer (ACH)",
    icon: "🏦",
    description: "Direct from your bank account",
    processingTime: "3-5 business days",
    feePercent: 0.8,
    feeFixed: 0,
    feeCap: 5,
    recommended: true,
  },
  {
    id: "debit_card",
    name: "Debit Card",
    icon: "💳",
    description: "Pay with your debit card",
    processingTime: "Instant",
    feePercent: 1.5,
    feeFixed: 0.25,
  },
  {
    id: "credit_card",
    name: "Credit Card",
    icon: "💳",
    description: "Visa, Mastercard, Amex, Discover",
    processingTime: "Instant",
    feePercent: 2.9,
    feeFixed: 0.30,
  },
  {
    id: "apple_pay",
    name: "Apple Pay",
    icon: "🍎",
    description: "Pay with Apple Pay",
    processingTime: "Instant",
    feePercent: 2.9,
    feeFixed: 0.30,
  },
  {
    id: "google_pay",
    name: "Google Pay",
    icon: "📱",
    description: "Pay with Google Pay",
    processingTime: "Instant",
    feePercent: 2.9,
    feeFixed: 0.30,
  },
  {
    id: "venmo",
    name: "Venmo",
    icon: "✌️",
    description: "Pay with Venmo",
    processingTime: "Instant",
    feePercent: 1.9,
    feeFixed: 0.10,
  },
  {
    id: "paypal",
    name: "PayPal",
    icon: "🅿️",
    description: "Pay with PayPal",
    processingTime: "Instant",
    feePercent: 2.9,
    feeFixed: 0.30,
  },
];

export function calculateFee(method: PaymentMethod, amount: number): number {
  let fee = (amount * method.feePercent / 100) + method.feeFixed;
  if (method.feeCap && fee > method.feeCap) {
    fee = method.feeCap;
  }
  return Math.round(fee * 100) / 100;
}

export function getPaymentMethod(id: PaymentMethodType): PaymentMethod | undefined {
  return PAYMENT_METHODS.find(m => m.id === id);
}

// Payout methods for providers (lower fees for receiving)
export interface PayoutMethod {
  id: string;
  name: string;
  icon: string;
  description: string;
  processingTime: string;
  feePercent: number;
  feeFixed: number;
}

export const PAYOUT_METHODS: PayoutMethod[] = [
  {
    id: "ach_standard",
    name: "Standard Bank Transfer",
    icon: "🏦",
    description: "Free transfer to your bank",
    processingTime: "2 business days",
    feePercent: 0,
    feeFixed: 0,
  },
  {
    id: "ach_instant",
    name: "Instant Bank Transfer",
    icon: "⚡",
    description: "Get paid within minutes",
    processingTime: "Within 30 minutes",
    feePercent: 1.5,
    feeFixed: 0.50,
  },
  {
    id: "venmo",
    name: "Venmo",
    icon: "✌️",
    description: "Instant to Venmo balance",
    processingTime: "Instant",
    feePercent: 0,
    feeFixed: 0.25,
  },
  {
    id: "paypal",
    name: "PayPal",
    icon: "🅿️",
    description: "Instant to PayPal balance",
    processingTime: "Instant",
    feePercent: 0,
    feeFixed: 0.25,
  },
];

// Insurance licensing types
export interface StateLicense {
  state: string;
  licenseNumber: string;
  expirationDate: string;
  verified: boolean;
}

export interface BusinessLicensing {
  licensedStates: string[];
  licenses: StateLicense[];
  nationalProducerNumber?: string; // NPN for insurance agents
}

// Compliance disclaimers
export const DISCLAIMERS = {
  quoteDisclaimer: `The quotes displayed are estimates based on the information you provided. Actual premiums may vary based on additional underwriting factors. Final rates will be determined by the insurance carrier upon application review.`,

  leadGenDisclaimer: `WOML is a lead generation platform that connects consumers with licensed insurance agents. WOML does not sell, bind, or underwrite insurance policies. All insurance products are offered and sold by licensed insurance agents and carriers.`,

  licenseVerification: `By proceeding, you confirm that you are seeking insurance quotes in a state where you reside and that you understand a licensed insurance agent will contact you to complete your application.`,

  privacyNotice: `Your information will be shared with licensed insurance agents to provide you with quotes. By submitting, you consent to being contacted by phone, email, or text regarding insurance products.`,

  agentDisclaimer: `Insurance products are offered through licensed insurance agents. Verify your agent's license at your state's Department of Insurance website.`,

  // Per-Lead Payment Compliance
  perLeadPaymentNotice: `Lead providers are compensated on a per-lead basis, not per customer acquisition or policy sale. This payment structure ensures fair market competition and compliance with lead generation regulations.`,

  antiMonopolyNotice: `WOML maintains fair market practices by compensating lead providers per qualified lead submitted, regardless of conversion outcome. This prevents any single buyer from monopolizing lead sources through conversion-based pricing.`,

  // Financial Transparency
  feeTransparency: `All transaction fees are clearly disclosed before payment. WOML does not charge hidden fees. Processing fees vary by payment method and are charged by third-party payment processors.`,

  providerPayoutNotice: `Lead providers receive payment for each qualified lead submitted according to their agreement terms. Payouts are processed via your selected payout method. Standard bank transfers are free; instant transfers and digital wallets may have small fees.`,

  // State Compliance
  stateComplianceNotice: `Insurance lead generation is regulated at the state level. WOML ensures all lead transactions comply with applicable state laws. Buyers must hold valid insurance licenses in states where they receive leads.`,

  buyerLicenseRequirement: `By registering as a lead buyer, you certify that you hold valid insurance licenses in all states you select, and you agree to only receive leads from states where you are licensed to conduct business.`,

  tcpaCompliance: `By submitting contact information, you consent to be contacted by licensed insurance agents via phone, text, or email regarding insurance products. You may opt out at any time. This consent is not a condition of purchase.`,
};

// Platform fee structure (WOML's cut)
export const PLATFORM_FEES = {
  leadTransactionFee: 0, // WOML takes no cut from lead payments (transparent)
  paymentProcessingPassthrough: true, // We pass through payment processor fees only
  noHiddenFees: true,
};

// Calculate payout fee
export function calculatePayoutFee(method: PayoutMethod, amount: number): number {
  const fee = (amount * method.feePercent / 100) + method.feeFixed;
  return Math.round(fee * 100) / 100;
}

// Calculate net payout after fees
export function calculateNetPayout(method: PayoutMethod, amount: number): number {
  const fee = calculatePayoutFee(method, amount);
  return Math.round((amount - fee) * 100) / 100;
}
