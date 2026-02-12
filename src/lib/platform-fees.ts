// Platform fee defaults (fallback if DB unavailable)
export const PLATFORM_FEE_TOTAL = 2.0;
export const PLATFORM_FEE_PROVIDER = 1.0;
export const PLATFORM_FEE_BUYER = 1.0;

export function calculateFeeBreakdown(
  ratePerLead: number,
  fees?: { fee_total?: number; fee_buyer?: number; fee_provider?: number }
) {
  const rate = Number(ratePerLead) || 0;
  const providerFee = fees?.fee_provider ?? PLATFORM_FEE_PROVIDER;
  const buyerFee = fees?.fee_buyer ?? PLATFORM_FEE_BUYER;
  const totalFee = fees?.fee_total ?? PLATFORM_FEE_TOTAL;
  return {
    ratePerLead: rate,
    providerFee,
    buyerFee,
    totalPlatformFee: totalFee,
    providerNet: Math.round((rate - providerFee) * 100) / 100,
    buyerTotal: Math.round((rate + buyerFee) * 100) / 100,
  };
}
