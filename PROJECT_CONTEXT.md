# WOML (Word of Mouth Leads) — Claude Code Context

## What Is WOML?
WOML is a **private-channel lead generation platform** that connects auto insurance agencies (buyers) with car salesmen (sellers/providers). It is **not** a public marketplace — each insurance business has a completely isolated, private channel. Lead providers are invited by the business via unique links or SMS; they cannot see or access any other business on the platform.

**Live URL:** https://womleads.com
**Vercel Project ID:** prj_NpIry9qKDQD4CSqAOaK1JiN3p0tW
**Admin/Owner:** Ryan Crookham — rcrookham@gmail.com | 267-393-5417 | Options Insurance Agency

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js (deployed on Vercel) |
| Auth | NextAuth.js (replaced Supabase) |
| Database | Vercel Postgres |
| Payments | Stripe Connect (marketplace) |
| SMS Invites | Twilio |
| ID Verification | License scanner integration |

---

## Architecture: Private Channel Model

This is a **multi-tenant, private-channel architecture**:

1. **Business (buyer)** creates an account and configures:
   - Lead criteria and required fields
   - Payout rates per lead
   - Mandatory vs. optional fields
2. **Business invites providers** via a unique invite link or branded SMS (via Twilio)
3. **Provider** signs up through that link and is scoped exclusively to that business's channel
4. A provider invited by multiple businesses gets **separate, isolated access** per business
5. No provider ever has visibility into other businesses or can submit leads to uninvited businesses

---

## User Roles

| Role | Description |
|------|-------------|
| **Business (Buyer)** | Insurance agency — pays per lead. Tabs: Dashboard, Leads, Ledger, Invite |
| **Lead Provider (Seller)** | Car salesman — sends leads, earns per submission. Tabs: Dashboard, Leads, Earnings |
| **Admin (Master Operator)** | Ryan Crookham only — single sign-in. Tabs: Profitability, Payment, Info |

---

## Stripe Integration

### Why Stripe (Not Venmo)
Venmo violates TOS for marketplace/middleman transactions at volume (~3,000 leads/month). Stripe Connect is the correct product — money flows in from the agency, WOML takes a spread, and the car salesman is paid automatically to their bank account.

### Setup Steps (Complete These in Stripe Dashboard)
1. Complete Stripe account setup — EIN, business address, bank account
2. Enable **Stripe Connect** in Settings → Connect settings
3. Add Stripe API keys to Vercel environment variables:
   - `STRIPE_SECRET_KEY` (server-side, never expose)
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (client-side)
   - `STRIPE_WEBHOOK_SECRET` (for webhook verification)

### Payment Flow
```
Car Buyer → Lead Provider submits lead
Lead Provider earns payment →
  [Stripe Charge to Business/Agency]
    ├── WOML takes spread (flat $ / % / hybrid)
    └── Provider receives remainder → their bank account (Stripe Connect payout)
```

### Fee Structure (Admin-Configurable)
- **Flat:** Fixed $ per lead
- **Percentage:** % of lead value
- **Hybrid:** Flat $ + % combined
Fee structure is displayed in contracts and data visuals for all parties. Must be documented for future 1099 purposes.

### 1099 Tracking
- Track cumulative earnings per provider
- Flag providers approaching $600/year threshold
- Admin "Info" tab shows providers close to 1099 status

### Current Status (as of late Feb 2026)
- "Pay via Stripe" button deployed and showing real Stripe errors
- Needs: Complete account setup + Enable Connect to go live
- Test grouping function and 1099 functionality still pending

---

## Twilio Integration (SMS Invites)

### Purpose
When a business adds a new lead provider, WOML sends an **SMS invite** via Twilio containing the provider's unique invite link to that business's private channel.

### Account Info
- Account SID and Auth Token must be stored as environment variables (never hardcoded):
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_PHONE_NUMBER`

### Invite Flow
```
Business clicks "Invite" tab
→ Enters provider's phone number (and optionally name)
→ WOML generates a unique scoped invite link
→ Twilio sends SMS: "You've been invited to submit leads on WOML. Sign up here: [unique link]"
→ Provider signs up → scoped exclusively to that business
```

### Key Rules
- Invite links must be unique per provider-per-business
- Link signup must auto-scope the provider to the inviting business only
- The "Invite" tab on the business dashboard handles this flow

---

## Lead Transaction Flow

When a lead is submitted:
1. Lead is recorded on **Provider side**: Dashboard, Leads, Earnings
2. Lead is recorded on **Business side**: Dashboard, Leads, Ledger
3. Financial transaction fires via Stripe:
   - Business charged
   - WOML spread deducted
   - Provider paid

All three steps must be atomic — if the financial transaction fails, the lead should not be marked as complete.

---

## Admin Panel Requirements

### Profitability Tab
- WOML lead fees (revenue)
- Recurring costs: Claude API ~$120/mo, domain ~$15/yr, Stripe fees (2.9% + $0.30 per transaction)
- Profit = revenue − costs (weekly / monthly / yearly views)

### Payment Tab
- View and switch fee structure (flat / % / hybrid)
- Transparent breakdown shown to all parties
- Updates contracts and data visuals automatically

### Info Tab
- Provider data: fees earned, money made, last lead sent, 1099 proximity
- Business data: fees paid, leads received

---

## Security & Privacy

- **Private channel architecture**: Providers are scoped per business — full isolation
- **License verification**: ID scanner validates real licenses, rejects fake/blurry ones
- **Database**: Vercel Postgres (SOC 2 compliant, encrypted at rest)
- **Auth**: NextAuth.js with JWT sessions (no external API calls on auth check)
- **No Supabase** — fully removed, replaced with Vercel Postgres

---

## Known Issues / In-Progress

- Lead not recording on both dashboard sides after submission — fix needed
- Stripe "Pay via Stripe" button showing real errors now — need to complete Stripe account setup
- Invite tab exists but needs audit and improvement
- ID scanner tech working for valid licenses, but lead not being recorded downstream

---

## Environment Variables Required

```env
# Auth
NEXTAUTH_SECRET=
NEXTAUTH_URL=https://womleads.com

# Database
POSTGRES_URL=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```

---

## Legal / Business Status (as of Mar 2026)
- Forming PA LLC
- Getting EIN
- Opening business bank account
- Operating agreement with co-founder in progress
- Referral fee compliance review for PA insurance law pending
- IP assignment agreement pending
- Privacy policy and TOS needed (collecting DL info, personal/insurance data)

---

*This file provides context for Claude Code. Keep it updated as the project evolves.*
