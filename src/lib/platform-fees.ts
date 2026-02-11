// Platform fee constants — change these to adjust pricing
export const PLATFORM_FEE_TOTAL = 2.0; // $2 flat fee per lead
export const PLATFORM_FEE_PROVIDER = 1.0; // $1 from provider earnings
export const PLATFORM_FEE_BUYER = 1.0; // $1 added to buyer cost

export function calculateFeeBreakdown(ratePerLead: number) {
  const rate = Number(ratePerLead) || 0;
  return {
    ratePerLead: rate,
    providerFee: PLATFORM_FEE_PROVIDER,
    buyerFee: PLATFORM_FEE_BUYER,
    totalPlatformFee: PLATFORM_FEE_TOTAL,
    providerNet: Math.round((rate - PLATFORM_FEE_PROVIDER) * 100) / 100,
    buyerTotal: Math.round((rate + PLATFORM_FEE_BUYER) * 100) / 100,
  };
}
