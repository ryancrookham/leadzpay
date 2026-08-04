# WOML — Complete Project Context

> **Purpose of this document:** self-contained handoff. If the only surviving artifact is this file plus the repo, a fresh Claude (or new engineer) should be able to pick up development without further context. All secret values are referenced by name only — never inline.

Last updated: 2026-08-02
Written from: session `a4d2c8da-c2ac-475d-b273-50bb3a547732`

---

## 1. What WOML Is

**WOML** = "Word of Mouth Leads"

A **private-channel lead-generation marketplace** connecting insurance agencies (buyers) with car salesmen / other lead sellers (providers). Unlike a public marketplace (e.g. lead-aggregator sites), each buyer has a **completely isolated, private channel**. Providers are invited by a single business and are scoped exclusively to that business — they cannot see or submit leads to any other business on the platform.

- **Live URL:** https://www.womleads.com
- **Vercel Project ID:** `prj_NpIry9qKDQD4CSqAOaK1JiN3p0tW`
- **Vercel scope:** `rycrookham-5982s-projects`
- **GitHub:** https://github.com/ryancrookham/leadzpay (private)
- **Local path:** `/Users/ryancrookham/Desktop/WOML/leadzpay/`
- **Legal entity:** Ryan Crookham (owner) — PA LLC formation in progress as of Mar 2026
- **Contact:** rcrookham@gmail.com | 267-393-5417

### Core value proposition
- **For agencies (buyers):** cheap, high-intent leads from trusted human referrers, gated by whatever criteria the agency defines.
- **For salesmen (providers):** monetize existing conversations they're already having ("who insures your car?") — passive income per lead submitted.
- **For WOML:** takes a spread on every transaction via Stripe Connect.

### Sister project
The user is separately building **Options Insurance Agency** — an independent insurance agency website + mobile app that will *consume* WOML leads. Repo: `/Users/ryancrookham/Desktop/WOML/options-insurance/` (sibling folder). Live at https://options-insurance.vercel.app. Same Vercel account, different project. WOML pushes leads → Options converts them via a scan-first quote flow (DL + VIN scanning). See `~/Desktop/WOML/options-insurance/` and its own `CLAUDE.md` for details.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| **Framework** | Next.js 16.1.6 (App Router) | Turbopack default in v16 |
| **Runtime** | React 19+, Node 22.x | |
| **Auth** | NextAuth.js v5 (Auth.js) | Replaced Supabase; JWT sessions |
| **Database** | Neon Postgres (serverless) | Referenced via `@neondatabase/serverless` in scripts |
| **Hosting** | Vercel | Production on `main` branch |
| **Payments** | Stripe Connect (marketplace) | Marketplace model; WOML takes spread, providers get Connect payouts |
| **SMS** | Twilio | Invite links to providers |
| **Verified voice calls** | Sinch Voice | PHONE_CALL criteria field type — see commits `a9336e9`, `0b56bfb`, `6361589`, `fff8478` |
| **Transactional email** | Resend | |
| **ID Verification / DL scanning** | Anthropic Claude Vision | For provider license verification |
| **Styling** | Tailwind CSS | See `postcss.config.mjs`, `globals.css` |
| **Fonts** | Google Fonts — Source Serif 4 (headings), sans (body) | Recent switch — commits `886e8cc`, `ebf1a32` |

`package.json` scripts:
```
dev    → next dev
build  → next build
start  → next start
lint   → eslint
```

---

## 3. Architecture — Private Channel Model

**Multi-tenant with strict tenant isolation.** Never a public marketplace.

Flow:
1. **Business (buyer)** creates account → configures lead criteria, required fields, per-lead payout rates, fee structure.
2. Business generates **unique invite links** (or SMS invites via Twilio) for specific providers.
3. **Provider (seller)** signs up through that invite → scoped exclusively to the inviting business's channel.
4. A single provider can be invited by multiple businesses → each is a **separate, isolated access grant**. No cross-visibility ever.
5. Provider submits leads only into the specific business's channel that invited them.

**No provider ever has visibility into other businesses or can submit leads to uninvited businesses.** This is enforced at the DB/query level via the connection model.

---

## 4. User Roles

| Role | Description | Nav Tabs |
|---|---|---|
| **Business (Buyer)** | Insurance agency — pays per lead | Dashboard, Leads, Ledger, Invite, Connections, Settings |
| **Provider (Seller)** | Car salesman etc. — sends leads, earns per submission | Dashboard, Leads, Earnings |
| **Admin (Master Operator)** | **Ryan Crookham only** — single sign-in | Profitability, Payment, Info |

Admin login is hard-coded to Ryan via `ADMIN_PASSWORD_HASH` env var (bcrypt hash).

---

## 5. Lead Transaction Flow

When a provider submits a lead:

1. **Lead recorded on Provider side:** Dashboard, Leads, Earnings tabs update.
2. **Lead recorded on Business side:** Dashboard, Leads, Ledger tabs update.
3. **Financial transaction fires via Stripe Connect:**
   - Business is charged (payment method on file)
   - WOML takes its spread
   - Provider is paid to their bank account (Stripe Connect payout)

**Must be atomic:** if any step of the financial transaction fails, the lead is NOT marked complete. Known bug (as of Feb-Mar 2026): lead not always recording on both dashboard sides — needs revisit.

---

## 6. Fee Structure (Admin-Configurable)

Fee shapes stored in `platform_settings` table. Three types:

- **Flat:** Fixed dollar amount per lead
- **Percentage:** Percent of lead value
- **Hybrid (mixed):** Flat + Percent combined

**Current production config** (per migration `scripts/migrate-hybrid-fee.mjs`, added 2026-08-02):
- `fee_type = mixed`
- `fee_mixed_flat = 0.30` ← offsets Stripe's per-transaction fee
- `fee_mixed_percent = 12.5`
- `fee_mixed_buyer_share = 50` ← buyer and provider split the fee 50/50

**Why the flat $0.30 component:** Stripe charges $0.30 per transaction regardless of size. Without a flat WOML fee to offset it, low-value leads (<$3-$4) leave WOML with negative net margin. The migration fixed this and split the fee equally between the two parties.

Fee structure is displayed transparently in contracts and dashboard visuals for all parties. Also required for 1099 tracking.

### 1099 tracking
- Cumulative earnings tracked per provider
- Providers approaching $600/yr threshold get flagged in Admin "Info" tab
- Ryan must issue 1099s at year-end for any provider over $600

---

## 7. Directory Layout

```
leadzpay/
├── CLAUDE.md                  ← Project-level context (auto-loaded by Claude Code)
├── WOML_CONTEXT.md            ← THIS FILE — comprehensive context
├── README.md
├── package.json               ← 13 runtime deps, 10 dev deps
├── next.config.ts             ← Includes SEO redirects from old .html paths
├── vercel.json                ← Vercel deployment config
├── schema.sql                 ← Base DB schema
├── migrations/                ← Numbered SQL migrations (001–009)
│   ├── 001_connections_enhancement.sql
│   ├── 002_password_reset_tokens.sql
│   ├── 003_user_profile_and_payout.sql
│   ├── 004_invites.sql
│   ├── 004_invite_tokens.sql
│   ├── 006_lead_criteria_deal_terms.sql
│   ├── 007_verified_calls.sql
│   ├── 008_criteria_call_phone.sql
│   └── 009_term_proposals.sql
├── scripts/
│   ├── migrate-hybrid-fee.mjs ← Fee structure migration (Aug 2026)
│   └── (other one-off migration scripts)
├── run-migration.mjs          ← Migration runner
├── public/
│   ├── favicon-new.png        ← New favicon source (added Aug 2026)
│   └── (other static assets)
├── src/
│   ├── app/                   ← Next.js App Router pages
│   │   ├── layout.tsx
│   │   ├── page.tsx           ← Homepage
│   │   ├── auth/              ← NextAuth routes
│   │   ├── business/          ← Business dashboard (see CRITICAL RULES)
│   │   ├── provider-dashboard/
│   │   ├── provider-onboarding/
│   │   ├── admin/             ← Ryan-only admin panel
│   │   ├── leads/
│   │   ├── ledger/
│   │   ├── customer/          ← Customer portal
│   │   ├── rolodex/           ← Contact/relationship management
│   │   ├── dashboard/         ← Generic dashboard router
│   │   ├── api/               ← API routes (Stripe webhooks, Twilio, etc.)
│   │   ├── components/        ← Shared page components
│   │   │   └── CustomCursor.tsx  ← Stub, unused
│   │   ├── social/
│   │   ├── legal/             ← Terms, Privacy
│   │   ├── faq/
│   │   ├── about/
│   │   ├── contact/
│   │   ├── how-it-works/
│   │   ├── pricing/
│   │   ├── globals.css
│   │   ├── favicon.ico
│   │   └── global-error.tsx
│   └── lib/
│       └── server/            ← Server-only utilities (DB queries, auth helpers)
├── eslint.config.mjs
├── tsconfig.json
└── postcss.config.mjs
```

---

## 8. Critical Coding Rules (Learn-the-Hard-Way)

**These are non-negotiable — violating any of them has caused production crashes.**

### React hooks ordering in `business/page.tsx`
**ALL React hooks MUST be placed ABOVE early returns.** Violating this triggers React error #310 in production. This has bitten us at least once. The Rules of Hooks matter and Next.js's App Router with client components will surface this loudly at runtime, not build time.

### Payment mode semantics
`payment_timing` on the **connection** is the source of truth for payment behavior — not on the lead or on the business/provider profile. `per_lead` as a payment mode was removed; do not reintroduce any references. See commits `42fe2fd`, `bc67f59`, `fa4c908`.

### Instant pay scoping
"Instant pay" only applies to connections explicitly configured as `instant`. Never trigger instant payout on `biweekly` or `scheduled` leads. See commit `588473d`.

### Termination notice default
Default to **0 days**, not 7. Wrong default was in production briefly — see commit `cbd3e2d`.

---

## 9. Environment Variables (names only — values in Vercel + Apple Passwords)

### Local `.env.local` at `/Users/ryancrookham/Desktop/WOML/leadzpay/.env.local`:
```
AUTH_SECRET
AUTH_URL
DATABASE_URL
ENCRYPTION_KEY
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
ASAP_PHONE_NUMBER
```

### Additional vars in Vercel production only:
```
ADMIN_PASSWORD_HASH   ← bcrypt hash of Ryan's admin password
ANTHROPIC_API_KEY     ← Claude Vision for DL scanning
RESEND_API_KEY        ← Transactional email
```

### Auto-provisioned by Vercel (do not manage manually):
```
VERCEL, VERCEL_ENV, VERCEL_URL, VERCEL_GIT_*, VERCEL_OIDC_TOKEN, VERCEL_TARGET_ENV
NX_DAEMON, TURBO_CACHE, TURBO_DOWNLOAD_LOCAL_ENABLED, TURBO_REMOTE_ONLY, TURBO_RUN_SUMMARY
```

### 🔥 CRITICAL SECRET: `ENCRYPTION_KEY`
Encrypts sensitive data at rest in the DB. **If lost, that data is permanently unreadable — cannot be regenerated.** Backup locations:
- Vercel production env
- Local `.env.local`
- Local `.env.vercel-backup-2026-07.local` (from `vercel env pull`)
- Apple Passwords entry "WOML Encryption Key" (synced via iCloud Keychain)

### Where to recover env vars if all local copies are lost
Run: `cd leadzpay && npx vercel env pull .env.local.recovered`

Requires Vercel CLI login as user `rycrookham-5982`.

---

## 10. Setup & Run

### First-time setup
```bash
cd /Users/ryancrookham/Desktop/WOML/leadzpay
npm install
# Populate .env.local (either manually or via `vercel env pull .env.local`)
npm run dev
# → http://localhost:3000
```

### Deploying
- **Preview deploy** (any branch): `npx vercel`
- **Production deploy** (from `main`): `npx vercel --prod` OR merge to `main` and Vercel auto-deploys
- **Requires:** `vercel login` first (interactive, opens browser)

### Running database migrations
```bash
node run-migration.mjs
# OR for one-off scripts:
node scripts/migrate-hybrid-fee.mjs
```

Migration scripts load `.env.local` inline (no dotenv dependency). They require `DATABASE_URL` or `POSTGRES_URL` env var.

---

## 11. Key Integrations — Deep Dive

### Stripe Connect
- **Product:** Stripe Connect (marketplace), NOT plain Payments
- **Why:** Venmo would violate TOS for marketplace/middleman transactions at expected volume (~3,000 leads/mo)
- **Flow:** Business charged → WOML takes spread → Provider paid to their bank via Connect payout
- **Setup steps still open (as of Mar 2026 per CLAUDE.md):**
  1. Complete Stripe account setup (EIN, business address, bank account)
  2. Enable Connect in Stripe Settings
  3. Test grouping function + 1099 functionality
- **Payment mode types:** `instant`, `manual`, `scheduled` (biweekly/weekly). NOT `per_lead` (removed).

### Twilio (SMS invites)
- When a business adds a provider, Twilio sends an SMS with a unique invite link
- Invite links must be unique per provider-per-business
- Link auto-scopes the signup to the inviting business only
- Managed in the "Invite" tab of the business dashboard

### Sinch Voice (Verified Phone Call Gate)
- New criteria field type: `PHONE_CALL`
- Enforces verified calls before lead is accepted
- Per-criteria phone number for routing (commit `fff8478`)
- Recent addition — see commits `a9336e9`, `0b56bfb`, `6361589`

### Anthropic (ID Verification)
- Claude Vision extracts data from DL photos during provider onboarding
- Rejects fake/blurry images
- Same API key concept used in Options Insurance for consumer DL scans

### Resend (Transactional Email)
- Used for password reset, notifications, etc.
- API key in Vercel prod only

---

## 12. Current State (as of 2026-08-02)

### ✅ Working / Shipped
- Multi-tenant private channel architecture
- Business + Provider + Admin dashboards
- Invite flow (SMS via Twilio)
- Lead submission + criteria enforcement
- Connection-scoped payment timing (instant/manual/scheduled)
- Terms renegotiation workflow (commits `7382956`, `22d780c`, `d36e46b`, `7d17a62`)
- Verified phone call gate (Sinch Voice)
- Photo capture criteria fields (Take Photo + Upload from Gallery on mobile)
- Hybrid fee structure ($0.30 flat + 12.5%, split 50/50)
- Recent typography refresh (Source Serif 4 headings)

### ⚠️ Known Issues / In-Progress
- **Lead not always recording on both dashboard sides** after submission — atomicity bug in the lead → payment flow
- **Stripe "Pay via Stripe" button showing real errors** — need to complete Stripe account setup
- **Invite tab exists but needs audit + improvement** (per CLAUDE.md)
- **ID scanner** works for valid licenses, but downstream lead recording sometimes fails

### 🔮 Not Yet Built
- Full 1099 auto-generation (tracking works, generation doesn't)
- Full Stripe Connect account setup (test grouping function pending)
- Admin panel "Profitability" tab full cost breakdown

---

## 13. Admin Panel Requirements (from CLAUDE.md)

Only accessible to Ryan via admin login.

### Profitability Tab
- WOML lead fees (revenue)
- Recurring costs: Claude API ~$120/mo, domain ~$15/yr, Stripe fees (2.9% + $0.30 per txn)
- Profit calc: revenue − costs (weekly/monthly/yearly views)

### Payment Tab
- View + switch fee structure (flat / % / hybrid)
- Transparent breakdown shown to all parties
- Updates contracts + data visuals automatically

### Info Tab
- Provider data: fees earned, money made, last lead sent, 1099 proximity
- Business data: fees paid, leads received

---

## 14. Security & Privacy

- **Private channel architecture:** Provider ↔ Business isolation enforced at DB/query level
- **License verification:** ID scanner rejects fake/blurry licenses
- **Database:** Neon Postgres (SOC 2 compliant, encrypted at rest with `ENCRYPTION_KEY`)
- **Auth:** NextAuth.js v5 with JWT sessions (no external API calls on auth check)
- **No Supabase** — fully removed and replaced with Neon Postgres (some old references may linger; delete if found)

---

## 15. Recent Notable Commits (context of active work)

```
51d8a57 Add hybrid fee migration script, new favicon, cursor stub
886e8cc Switch all section headings from Instrument Serif to Source Serif 4 bold
ebf1a32 Switch hero heading font to Source Serif 4 bold (700)
7d17a62 Show criteria fields in provider proposal review modal
d36e46b Fix: pre-populate criteria fields when opening Propose Terms modal
22d780c Extract CriteriaFieldBuilder + add to Propose Terms modal
7382956 Terms Renegotiation: proposal workflow for updating connection terms
fff8478 Add per-criteria call phone number for verified call routing
6361589 Phone Call Gate: PHONE_CALL criteria field type + verified call enforcement
0b56bfb Add Sinch Voice verified call - PHONE_CALL as criteria field type
a9336e9 Add Sinch Voice verified call feature
cbd3e2d Default termination notice to 0 days everywhere (was incorrectly 7)
fa4c908 Remove all remaining per_lead references from payment mode flow
e248690 Fix remaining stale per_lead union types causing TypeScript build error
bc67f59 Fix payment mode dropdowns in Connections tab to support instant/manual/scheduled
f474987 Settings: Default Payout Mode pre-fills InviteTab and stays in sync mid-session
588473d Scope instant pay to instant connections only — prevent biweekly leads from being paid early
42fe2fd Wire per-connection payment_timing as source of truth for payment behavior
ef041ea Add Take Photo + Upload from Gallery options for PHOTO fields on mobile
18f36d8 Fix remaining per_lead fallback in InviteTab invite generation
```

---

## 16. Sister Project — Options Insurance Agency

WOML has a symbiotic relationship with **Options Insurance** — a separate agency site + mobile app under construction.

- **Repo:** `/Users/ryancrookham/Desktop/WOML/options-insurance/` (sibling to leadzpay)
- **Currently NOT on GitHub** — local-only as of 2026-08-02 (deferred by user)
- **Live URL:** https://options-insurance.vercel.app
- **Vercel project:** `options-insurance` (same account: `rycrookham-5982s-projects`)
- **Purpose:** Consumer-facing insurance quote flow + eventual mobile app for car dealerships
- **Stack:** Next.js 16.2.4, Tailwind CSS v4, React 19.2, NextAuth v5 beta
- **Key tech:** DL scanning via Claude Vision; VIN scanning planned (PDF417 barcode + Vision fallback); EZLynx Rating Engine API (awaiting credentials); Capacitor planned for iOS/Android
- **Ecosystem role:**
  - WOML = automated lead acquisition (cheap top-of-funnel)
  - Options = direct-to-quote conversion engine (bottom-of-funnel)
  - Leads bought via WOML get pushed to Options's fast quote flow

Full context in `options-insurance/CLAUDE.md` (which currently just points to `AGENTS.md`) and in Claude auto-memory at `~/.claude/projects/-Users-ryancrookham/memory/options_insurance_project.md`.

**⚠️ CRITICAL: Options code needs a GitHub repo.** If this Mac dies before it's pushed, all the work is gone. Recommended: create `github.com/ryancrookham/options-insurance` and `git push -u origin main` from that folder.

---

## 17. Backup & Disaster Recovery Status (as of 2026-08-02)

### ✅ Safe if Mac dies
- **Source code:** GitHub (`ryancrookham/leadzpay`)
- **Production env vars:** Vercel dashboard (encrypted at rest)
- **Critical secrets (5)** in Apple Passwords → synced via iCloud Keychain to iPhone/iPad:
  - `ENCRYPTION_KEY`
  - `ADMIN_PASSWORD_HASH`
  - `AUTH_SECRET`
  - `DATABASE_URL`
  - `STRIPE_SECRET_KEY`
- **Claude context (`~/.claude/`)** — automated backup every 30 min to `~/claude-backups/latest/` + daily archives via macOS launchd agent at `~/Library/LaunchAgents/com.ryancrookham.claude-backup.plist`

### ⚠️ Still local-only
- Snapshot backup files (`.env.vercel-*.local`) — regenerable via `vercel env pull` but the files themselves live only on Mac
- **iCloud Drive is currently FULL** — cannot be relied on as off-device backup until user upgrades plan or frees space. As of 2026-08-02 the auto backup of Claude context to iCloud is BLOCKED by this.

### 🔥 Recovery playbook
If this Mac is lost, on a new machine:
1. Install Node.js 22+, Git, Vercel CLI (`npm i -g vercel`)
2. `git clone https://github.com/ryancrookham/leadzpay.git`
3. `cd leadzpay && vercel login` → sign in as `rycrookham-5982`
4. `vercel env pull .env.local` → repopulates all env vars from Vercel
5. `npm install && npm run dev`
6. For emergency access to critical secrets (if Vercel is compromised too): unlock Apple Passwords on iPhone → search "WOML"

---

## 18. Legal / Business Status (as of Mar 2026 — verify current state)

- Forming PA LLC (in progress)
- Getting EIN
- Opening business bank account
- Operating agreement with co-founder (in progress)
- Referral fee compliance review for PA insurance law (pending)
- IP assignment agreement (pending)
- Privacy policy + TOS (needed — collecting DL info, personal + insurance data)

Any Claude session working on WOML should assume the LLC + EIN are NOT complete unless verified otherwise. Legal restructuring may change entity relationships between WOML and Options Insurance.

---

## 19. Related Files & Documentation

| File | Purpose |
|---|---|
| `CLAUDE.md` at `/Users/ryancrookham/Desktop/WOML/CLAUDE.md` | Original project-level context, auto-loaded by Claude Code sessions |
| `WOML_CONTEXT.md` (this file) | Comprehensive standalone context — self-contained |
| `~/.claude/projects/-Users-ryancrookham/memory/MEMORY.md` | Claude's per-user auto-memory (WOML + Options) |
| `~/.claude/projects/-Users-ryancrookham/memory/options_insurance_project.md` | Options Insurance detailed memory |
| `README.md` in this repo | Basic project readme |

### Automated backup locations for this repo's context
- **Every 30 min:** `~/claude-backups/latest/` (mirror of `~/.claude/`)
- **Daily snapshots:** `~/claude-backups/daily-YYYY-MM-DD/`
- **Manual iCloud push (when iCloud has space):** `bash ~/claude-backups/sync-to-icloud.sh`
- **launchd agent config:** `~/Library/LaunchAgents/com.ryancrookham.claude-backup.plist`

---

## 20. Advice for a Fresh Claude Session

If you're a Claude instance opening this project fresh:

1. **Read `CLAUDE.md` first**, then this file (WOML_CONTEXT.md), then check `~/.claude/projects/-Users-ryancrookham/memory/MEMORY.md` if accessible.
2. **Read AGENTS.md** in this repo AND in `options-insurance/` if working across both — Options has strict warnings about Next.js 16 breaking changes.
3. **Never introduce `per_lead` payment mode references** — it was fully removed.
4. **When editing `business/page.tsx`**, put ALL hooks ABOVE early returns. Non-negotiable.
5. **When touching payment logic**, `payment_timing` on the connection is the source of truth. Not on lead or on profile.
6. **When writing tests or migrations**, use `DATABASE_URL` (or fallback to `POSTGRES_URL`) — see `scripts/migrate-hybrid-fee.mjs` pattern for how to load `.env.local` without dotenv.
7. **Never commit real secret values.** Reference by name only. Use `vercel env add` for new env vars.
8. **Deployments push automatically from `main`** — do NOT push directly to `main` without testing on a preview deploy first. Merge via PR when possible.
9. **The user (Ryan) prefers concise responses** with code-first answers, not long preambles. He owns the business and has multiple projects — respect his time.

---

## 21. Owner Contact & Escalation

**Ryan Crookham** — owner of both WOML and Options Insurance Agency.
- Email: rcrookham@gmail.com
- Phone: 267-393-5417
- Vercel handle: `rycrookham-5982`
- GitHub: `ryancrookham`

For business decisions (fee structure changes, new features, legal decisions), always defer to Ryan. Do not make architectural decisions autonomously — propose and confirm.

---

*End of WOML_CONTEXT.md. If something in this file has become inaccurate, update it in-place and commit. Keep this file as the single canonical handoff document.*
