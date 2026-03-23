// Platform fee defaults (fallback if DB unavailable)
// WOML charges a hybrid fee: $0.30 flat + 12.5% of lead value, split 50/50 between buyer and provider.
// The $0.30 flat component offsets Stripe's per-transaction $0.30 processing fee.
export const PLATFORM_FEE_MIXED_FLAT = 0.30;
export const PLATFORM_FEE_MIXED_PERCENT = 12.5;
export const PLATFORM_FEE_MIXED_BUYER_SHARE = 50; // 50% from buyer, 50% from provider (even split)

// Legacy constants (kept for reference, no longer active)
export const PLATFORM_FEE_PERCENT = 12.5;
export const PLATFORM_FEE_BUYER_SHARE = 50;
export const PLATFORM_FEE_TOTAL = 2.0;
export const PLATFORM_FEE_PROVIDER = 1.0;
export const PLATFORM_FEE_BUYER = 1.0;

export type FeeType = 'flat' | 'percent' | 'mixed';

export interface FeeSettings {
  fee_type?: FeeType;
  fee_total?: number;
  fee_buyer?: number;
  fee_provider?: number;
  fee_percent?: number;
  fee_percent_buyer_share?: number;
  fee_mixed_flat?: number;
  fee_mixed_percent?: number;
  fee_mixed_buyer_share?: number;
}

export function calculateFeeBreakdown(
  ratePerLead: number,
  fees?: FeeSettings
) {
  const rate = Number(ratePerLead) || 0;
  const feeType = fees?.fee_type ?? 'mixed';  // Default to hybrid: $0.30 flat + 12.5%

  let totalFee: number;
  let buyerFee: number;
  let providerFee: number;

  if (feeType === 'percent') {
    const pct = fees?.fee_percent ?? PLATFORM_FEE_PERCENT;
    totalFee = Math.round((rate * pct / 100) * 100) / 100;
    const buyerShare = (fees?.fee_percent_buyer_share ?? PLATFORM_FEE_BUYER_SHARE) / 100;
    buyerFee = Math.round(totalFee * buyerShare * 100) / 100;
    providerFee = totalFee - buyerFee;
  } else if (feeType === 'mixed') {
    const flatPortion = fees?.fee_mixed_flat ?? PLATFORM_FEE_MIXED_FLAT;
    const pctPortion = fees?.fee_mixed_percent ?? PLATFORM_FEE_MIXED_PERCENT;
    const percentAmount = Math.round((rate * pctPortion / 100) * 100) / 100;
    totalFee = Math.round((flatPortion + percentAmount) * 100) / 100;
    const buyerShare = (fees?.fee_mixed_buyer_share ?? PLATFORM_FEE_MIXED_BUYER_SHARE) / 100;
    buyerFee = Math.round(totalFee * buyerShare * 100) / 100;
    providerFee = totalFee - buyerFee;
  } else {
    // flat (default) — existing behavior
    providerFee = fees?.fee_provider ?? PLATFORM_FEE_PROVIDER;
    buyerFee = fees?.fee_buyer ?? PLATFORM_FEE_BUYER;
    totalFee = fees?.fee_total ?? PLATFORM_FEE_TOTAL;
  }

  return {
    ratePerLead: rate,
    providerFee,
    buyerFee,
    totalPlatformFee: totalFee,
    providerNet: Math.round((rate - providerFee) * 100) / 100,
    buyerTotal: Math.round((rate + buyerFee) * 100) / 100,
  };
}
