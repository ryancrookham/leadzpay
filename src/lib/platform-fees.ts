// Platform fee defaults (fallback if DB unavailable)
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
  const feeType = fees?.fee_type ?? 'flat';

  let totalFee: number;
  let buyerFee: number;
  let providerFee: number;

  if (feeType === 'percent') {
    const pct = fees?.fee_percent ?? 0;
    totalFee = Math.round((rate * pct / 100) * 100) / 100;
    const buyerShare = (fees?.fee_percent_buyer_share ?? 50) / 100;
    buyerFee = Math.round(totalFee * buyerShare * 100) / 100;
    providerFee = Math.round((totalFee - buyerFee) * 100) / 100;
  } else if (feeType === 'mixed') {
    const flatPortion = fees?.fee_mixed_flat ?? 0;
    const pctPortion = fees?.fee_mixed_percent ?? 0;
    const percentAmount = Math.round((rate * pctPortion / 100) * 100) / 100;
    totalFee = Math.round((flatPortion + percentAmount) * 100) / 100;
    const buyerShare = (fees?.fee_mixed_buyer_share ?? 50) / 100;
    buyerFee = Math.round(totalFee * buyerShare * 100) / 100;
    providerFee = Math.round((totalFee - buyerFee) * 100) / 100;
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
