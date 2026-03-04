// Payment method types and fee structures

export type PaymentMethodType =
  | "ach_bank"
  | "debit_card"
  | "credit_card"
  | "apple_pay"
  | "google_pay";

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
];

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
