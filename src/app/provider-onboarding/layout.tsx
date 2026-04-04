import type { Metadata } from "next";
import { getInviteTokenByToken, getUserById, getBusinessCriteriaWithFields } from "@/lib/db";

// Force dynamic rendering so searchParams are available at request time
export const dynamic = "force-dynamic";

const FALLBACK: Metadata = {
  title: "You're invited — WOML Word of Mouth Leads",
  description: "Join a provider network and earn money for every qualified lead you submit.",
};

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const token = params?.token;

  if (!token) return FALLBACK;

  try {
    const tokenRow = await getInviteTokenByToken(token);
    if (!tokenRow || !tokenRow.is_active) return FALLBACK;

    const buyer = await getUserById(tokenRow.buyer_id);
    const businessName = buyer?.business_name || buyer?.username || "WOML";

    const criteriaResult = await getBusinessCriteriaWithFields(tokenRow.buyer_id);
    const rate = criteriaResult
      ? Number(criteriaResult.criteria.payout_per_lead)
      : Number(tokenRow.rate_per_lead);

    const title = tokenRow.label
      ? `${tokenRow.label} — ${businessName}`
      : `Join ${businessName} — WOML`;

    const description = `You've been invited to join ${businessName}'s provider network. $${rate}/lead`;

    return {
      title,
      description,
      openGraph: { title, description },
    };
  } catch {
    return FALLBACK;
  }
}

export default function ProviderOnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
