# Whop Integration

Technical reference for how the LUTB Hub integrates with Whop for affiliate tracking and earnings. For the product-level description of distribution mechanics, see [`level-up-ta-bai/docs/distribution-mechanics.md`](../../../../level-up-ta-bai/docs/distribution-mechanics.md).

## Overview

Whop powers three things for the Hub:

1. **Authentication** — OAuth via Better Auth (already wired in `lib/auth.ts`)
2. **Affiliate tracking** — Members earn commissions from referrals
3. **Smart Splits** — Revenue sharing (read from Whop API, not built in-platform)

The Hub reads from Whop's affiliate API to surface earnings data in `/app/earn`. The platform does not build its own split logic.

## Required Environment Variables

| Variable | Description |
|----------|-------------|
| `WHOP_API_KEY` | Whop company API key for affiliate management |
| `WHOP_COMPANY_ID` | Whop company ID for affiliate creation |
| `WHOP_AFFILIATE_BASE_URL` | Base URL template for share links (e.g. `https://whop.com/level-up-ta-bai/?a=`) |

All three must be set for the Earn page to show live data. If any are missing, the page shows a "not configured" message.

## Implementation

### File: `lib/hub/whop-affiliates.ts`

#### `getEarnDashboard(userId)`

Entry point called by `GET /api/hub/earn`. Flow:

1. Check if Whop credentials are configured. If not, return a stub response.
2. Call `ensureAffiliate(userId)` to get or create the affiliate record.
3. Map the Whop affiliate response to `HubEarnResponse`.

#### `ensureAffiliate(userId)`

1. Load the member profile to check for an existing `whopAffiliateId`.
2. Load the Whop account identity from the `accounts` table (`providerId = "whop"`).
3. If the profile has a stored affiliate ID, fetch it from `GET /affiliates/{id}`.
4. If the fetch fails or no ID exists, create a new affiliate via `POST /affiliates`.
5. Persist the affiliate ID back to `member_profiles.whop_affiliate_id`.

#### `buildShareLink(baseUrl, username)`

Constructs the referral URL from the base URL template and the member's Whop username. Supports `{username}` placeholder, trailing `/` or `=`, and `?ref=` query parameter patterns.

### API Route: `GET /api/hub/earn`

Returns `HubEarnResponse` with:

- `configured` — whether Whop credentials are present
- `affiliateId` — Whop affiliate ID
- `username` — Whop username
- `shareLink` — Constructed referral URL
- `totals` — earnings, revenue, MRR, referrals, active members
- `message` — Status message if not configured

### Whop API Calls

All calls go through `whopAffiliateCall()` which hits `https://api.whop.com/api/v1`:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/affiliates/{id}` | Retrieve existing affiliate |
| POST | `/affiliates` | Create new affiliate for a user |

The Whop TypeScript SDK (`whopsdk-typescript`) is available at `/Users/cruzr/tools/whop/whopsdk-typescript` for reference but is **not used as a dependency** in the Hub codebase. All API calls use native `fetch` per the project's plugin guidelines.
