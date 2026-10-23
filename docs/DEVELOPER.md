# Seiya — Developer Guide

> Setup, environment, database, deployment and the full backend API reference. For the product overview, see the [README](../README.md).

Seiya is a couple-finance co-pilot. Two partners share one space, agree on their money rules once ("Seiya's Promise"), and Seiya enforces those rules on every shared expense: purchases above the agreed limit need the partner's approval, late impulse buys are held for a cooling-off period, and personal spending stays private.

**Live:** [https://seiya.web.id](https://seiya.web.id)

All money movement in this MVP is **simulated**. No endpoint moves real money.

## Contents

1. [Features](#1-features)
2. [Tech stack](#2-tech-stack)
3. [Getting started](#3-getting-started)
4. [Environment variables](#4-environment-variables)
5. [Database (Supabase)](#5-database-supabase)
6. [Deployment (Vercel + custom domain)](#6-deployment-vercel--custom-domain)
7. [Project structure](#7-project-structure)
8. Backend API reference (sections 8 onwards)

## 1. Features

- **Full-name sign-in.** Users register and sign in with their full name and a password; no email is asked. The server maps the name to an internal placeholder email and creates the account through the Supabase admin API.
- **Onboarding that follows the Figma design.** Choose Your Path (create or join a shared space) → story intro → 21 short profiling questions answered in order → profile summary → recent spending history.
- **Partner invitations.** The creator gets a single-use private link (`/invite?token=…`); the partner opens it or pastes it on the *Join shared space* screen.
- **Seiya's Promise.** Once both partners finish onboarding, Seiya's AI drafts one shared set of clauses (cost sharing, "discuss first" limit, cooling-off, family support, privacy, check-ins, emergency fund). Each partner selects and edits clauses; when both save the same version, the numbers become the household's active finance rules and the shared wallets open.
- **Country-aware amounts.** The "discuss first" question uses round amounts in the user's currency (detected from the browser, changeable); a joining partner uses the shared space's currency.
- **Chat attachments (no AI tokens in the normal path).** Files wait in the composer so you can add a note, then go on Send. 📎 bank statements are read with libraries (`unpdf` for PDF text, `xlsx`/SheetJS for Excel, a CSV reader) and imported after you confirm; files that are not statements are rejected with a clear reason. 🖼 receipt photos are read **on the device** with `tesseract.js` OCR plus rules (total, date, store, category); PDF e-receipts use `unpdf`. The vision model (`/receipt-scan`) is only a fallback when OCR finds no total. A confirmed receipt goes through the normal expense rules (limit, cooling-off, partner approval).
- **Dashboard.** Shared and personal wallets, transactions with automatic split, bills, budgets, couple goals, approvals queue, waiting list (cooling-off), settlement (who owes whom), activity log, bank-statement import, and the Ask Seiya AI chat.
- **Dual-key safety.** A requester can never approve their own request; sensitive actions can require a 6-digit PIN; rules are enforced by database RPCs and RLS, never by UI state or by the AI.

## 2. Tech stack

| Layer | Technology |
|---|---|
| App | Next.js 16 (App Router, Turbopack, `cacheComponents`), React 19, TypeScript |
| Styling | Tailwind CSS 4, Lora + Inter + Plus Jakarta Sans (`next/font`) |
| Auth & data | Supabase (Auth, Postgres, RLS, SECURITY DEFINER RPCs, pgvector) via `@supabase/ssr` cookie sessions |
| AI | Provider router with fallback: Groq → Mistral → OpenRouter → Cloudflare Workers AI (Gemini optional); RAG over `knowledge/seiya/*.md` |
| Hosting | Vercel (production), domain `seiya.web.id` on Vercel DNS |

The app is one Next.js project: the UI and the API routes (`src/app/api/**`) deploy together.

## 3. Getting started

Requirements: Node.js 20+ (24 recommended), npm, a Supabase project, and at least one AI provider key.

```bash
npm install
cp .env.example .env.local      # then fill in the values (see section 4)
npx supabase link --project-ref <your-project-ref>
npx supabase db push            # applies supabase/migrations
npm run dev                     # http://localhost:3000
```

Other scripts:

| Command | What it does |
|---|---|
| `npm run build` / `npm start` | Production build / serve the build locally |
| `npm run lint` | ESLint |
| `npm run test:setup` … `npm run test:statement` | Manual end-to-end scripts against a running dev server (see the last section) |

In Supabase → Authentication → Providers → Email, keep the Email provider **enabled** (username accounts are email accounts internally). "Confirm email" can stay off; accounts are created already confirmed.

## 4. Environment variables

Put values in `.env.local` locally and in Vercel → Project → Settings → Environment Variables for production. **Never commit real values.** `.gitignore` blocks every `.env*` file except the empty `.env.example` template.

### Supabase

| Variable | Required | Exposure | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Browser | Project URL, e.g. `https://<ref>.supabase.co`. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Browser | Publishable (anon) key; RLS protects the data. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Server only** | Used to create full-name accounts and to read both partners' onboarding answers when drafting Seiya's Promise. Never prefix with `NEXT_PUBLIC_`. Signup returns `503` when it is missing. |
| `SEIYA_USERNAME_EMAIL_DOMAIN` | No | Server only | Domain for the internal placeholder emails (default `users.seiya.invalid`). Changing it later locks out existing users. |

### Application

| Variable | Default | Description |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:3000` | Base for invitation links and the OpenRouter `HTTP-Referer`. Production: `https://seiya.web.id`. |
| `NEXT_PUBLIC_ENABLE_DEMO_SIMULATION` | `false` | Shows a screen switcher in the auth/onboarding flow for design review. Keep `false` in production. |

### AI provider keys (server only, secret)

The router skips any provider without a key.

| Variable | Provider |
|---|---|
| `GROQ_API_KEY` | Groq — [console.groq.com/keys](https://console.groq.com/keys) |
| `MISTRAL_API_KEY` | Mistral — [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `OPENROUTER_API_KEY` | OpenRouter — [openrouter.ai/workspaces/default/keys](https://openrouter.ai/workspaces/default/keys) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers AI — [dash.cloudflare.com](https://dash.cloudflare.com/) |
| `GOOGLE_API_KEY` | Optional. Gemini provider and the RAG query embeddings. Without it, chat still works and RAG reports `unavailable`. |

### AI orchestration (server only)

| Variable | Default | Description |
|---|---|---|
| `SEIYA_AI_PROVIDER_ORDER` | `groq,mistral,openrouter,cloudflare` | Fallback order. |
| `SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST` | `groq,mistral,openrouter` | Providers allowed to see private/financial data (Seiya's Promise drafting and chat use `private`). |
| `SEIYA_AI_PROVIDER_TIMEOUT_MS` | `7000` | Per-provider timeout (clamped 1500–12000). |
| `SEIYA_AI_MAX_PROVIDER_ATTEMPTS` | `4` | Attempts including fallbacks (clamped 1–5). |
| `SEIYA_AI_PROVIDER_COOLDOWN_MS` | `30000` | Cooldown before retrying a failed provider. |
| `SEIYA_AI_GROQ_MODEL`, `SEIYA_AI_MISTRAL_MODEL`, `SEIYA_AI_OPENROUTER_MODEL`, `SEIYA_AI_CLOUDFLARE_MODEL`, `SEIYA_AI_GEMINI_MODEL` | see `.env.example` | Model per provider. |
| `SEIYA_AI_CLOUDFLARE_ENABLE_TOOLS` | `false` | Allow tool calls on Cloudflare. |
| `SEIYA_AI_MISTRAL_VISION_MODEL` | `ministral-14b-latest` | Model that reads receipt photos (needs `MISTRAL_API_KEY`). |
| `SEIYA_AI_OPENROUTER_VISION_MODEL` | `nvidia/nemotron-3.5-super-vl:free` | Fallback receipt reader (needs `OPENROUTER_API_KEY`). |

### Script-only variables (not read by the app)

Supply these in the shell session when running a script; do not keep them in `.env.local`.

| Variable | Script |
|---|---|
| `SEIYA_RAG_SEED_KEY` | `scripts/seed/seiya-rag.mjs` (falls back to `SUPABASE_SERVICE_ROLE_KEY`) |
| `SUPABASE_SECRET_KEY`, `SEIYA_DUMMY_PASSWORD` | `scripts/seed/dummy-users.mjs` |

## 5. Database (Supabase)

Schema, RLS policies and RPCs live in `supabase/migrations/` and are applied with `npx supabase db push` (add `--include-all` if a migration is older than the latest applied one). Recent migrations:

| Migration | Adds |
|---|---|
| `20261018120000_household_write_path_rpcs.sql` | Bill, wallet and transaction writes through SECURITY DEFINER RPCs (authenticated users only have `SELECT` on those tables). |
| `20261018130000_username_signin_invitations.sql` | Token-only invitation acceptance (no email match) and finance-rule validation helpers. |
| `20261019090000_seiya_promise.sql` | `household_promises` and `household_promise_responses` tables, `get_household_partner`, onboarding progress, and the promise RPCs that activate the finance rules when both versions match. |

Partner profiles are not readable through `profiles` RLS; use the `get_household_partner` RPC (already used by `/api/auth/me`).

## 6. Deployment (Vercel + custom domain)

Production runs on Vercel project **seiya** with the domain **seiya.web.id** (and `www`).

1. Link once: `npx vercel link --project seiya`.
2. Set every variable from section 4 in Vercel (Production). Set `APP_BASE_URL=https://seiya.web.id`.
3. Deploy: `npx vercel deploy --prod`. `vercel.json` pins the **Next.js** framework preset; without it a CLI-created project builds as "Other" and every route returns 404.
4. Domain: the registrar (IDwebhost) points the nameservers to `ns1.vercel-dns.com` and `ns2.vercel-dns.com`; Vercel then serves DNS, `www`, and the HTTPS certificate. If you ever move DNS back to the registrar, use the records shown in Vercel → Settings → Domains instead.
5. Supabase → Authentication → URL Configuration: set the Site URL to `https://seiya.web.id` (sign-in uses name + password, so this only matters for future email links).

### Access from mainland China

Seiya is built for a competition in China, where Google services are blocked and some CDNs are unreliable. The browser only needs to reach **`seiya.web.id`**:

| Concern | Status |
|---|---|
| Login | Full name + password through our own API. No Google sign-in. |
| Fonts | `next/font` downloads Lora, Inter and Plus Jakarta Sans at build time and serves them from `/_next/static/media`; no runtime request to Google Fonts. |
| Receipt OCR (tesseract.js) | Worker, engine (WASM) and `eng`/`ind` language data are served from `/ocr` on our domain, not `cdn.jsdelivr.net`. `scripts/build/copy-ocr-assets.mjs` copies them from the pinned npm packages (`tesseract.js`, `tesseract.js-core`, `@tesseract.js-data/eng`, `@tesseract.js-data/ind`) before every `dev`/`build`; `public/ocr/` is git-ignored. Verified: with `/ocr` removed the OCR fails instead of falling back to the CDN, and with it present the sample receipt reads in about 1 s. |
| Supabase | Only the server talks to Supabase. Chat history, the last direct browser read, now goes through `GET /api/households/[householdId]/chat-history`. |
| AI providers (Groq, Mistral, OpenRouter, Cloudflare) | Called only from the Vercel server, outside China. |
| Analytics / trackers | None. |

The only external hosts left in the client bundle are strings the browser never requests (tesseract.js's default CDN path, which `src/lib/receipt-ocr.ts` overrides, and a license comment).

Remaining risks:

- **Vercel from China.** `*.vercel.app` addresses are often blocked; use `https://seiya.web.id`. Custom domains on Vercel usually load but can be slow or intermittent depending on the network. Test from inside China before the event (for example a phone on a Chinese mobile network, or an online "China speed test" for the URL).
- **If it is too slow**, the usual fix is a host with mainland or Hong Kong points of presence. Hosting inside mainland China requires an ICP filing (ICP备案) for the domain; Hong Kong hosting does not.
- **First receipt scan** downloads about 8 MB once (engine plus Indonesian/English data); later scans are cached by the browser.

## 7. Project structure

```text
src/
  app/
    page.tsx                 # app shell: auth gating, onboarding, dashboard tabs
    invite/page.tsx          # partner invitation landing (stores the token, then redirects)
    api/**/route.ts          # HTTP endpoints
  proxy.ts                   # Supabase session refresh (Next 16 replacement for middleware)
  backend/
    services/                # business logic (auth, households, promise, transactions, …)
    validators/              # request validation
    agents/                  # AI provider router and chat agent
    rag/                     # knowledge retrieval
  components/
    views/                   # screens (landing, auth/onboarding, home, bills, chat, profile, …)
    onboarding/promise-ui.tsx# Figma building blocks for the promise flow
    layout/, modals/, cards/, icons/, ui/
  lib/
    api.ts                   # typed client for every API route
    store.tsx                # AppContext backed by the API (session, household, data, polling)
    transformers.ts          # API rows -> UI models
    country-currency.ts      # country detection and per-currency amounts
supabase/migrations/         # database schema, RLS and RPCs
knowledge/seiya/*.md         # RAG knowledge (each `##` section is one chunk)
public/
  seiya-logo.svg, seiya-icon.svg
  images/                    # auth, onboarding and dashboard artwork (WebP/PNG/SVG)
  videos/                    # Seiya mascot animations
  ocr/                       # tesseract.js files, copied at dev/build time (git-ignored)
scripts/
  build/                     # run by npm: copy OCR assets (pre dev/build), patch orb-ui (postinstall)
  seed/                      # seed the RAG knowledge and dummy users
  test/                      # end-to-end checks against a running server (section 30)
  tools/                     # AI provider smoke test, README image generator
docs/
  DEVELOPER.md               # this guide
  DESIGN.md                  # brand, colours, typography, UX copy
  FINTECHATHON.pdf           # competition brief
  images/                    # README banner and flow diagrams
```

> `knowledge/seiya/` is read by the RAG seed script. Keep only product knowledge there; private working notes in that folder are git-ignored but would still be embedded if you seed from your machine.

---

# Backend API reference

> **Audience:** developers working on the Seiya Next.js app. Check the route and validator source before relying on any field marked **confirm in source**. This is an integration guide, not a substitute for server-side authorization.

## 8. Integration conventions

- Endpoints: `src/app/api/**/route.ts`; business logic: `src/backend/services/**`; validation: `src/backend/validators/**`; AI: `src/backend/agents/**`; RAG: `src/backend/rag/**`.
- Sessions are Supabase cookies (`@supabase/ssr`). The browser calls same-origin APIs and keeps cookies. Never send a service-role key or provider key to the browser.
- Local base URL in examples: `http://localhost:3000`.

### Common request pattern

Use JSON request bodies for `POST`, and use `Content-Type: application/json` when a body is present. Authenticated endpoints expect the user's valid Supabase session cookie.

For a same-origin browser app, `fetch` can use the default same-origin cookie behavior. For cross-origin frontends, coordinate origin, cookie, and CORS settings with the backend developer rather than placing tokens in local storage or request JSON.

### Common response and error expectations

Most routes return JSON with a `success` boolean and either result data or a safe error message. Do not assume every route uses the same result property (`data`, `result`, `rule`, etc.); use each endpoint section below.

Observed/status conventions:

| HTTP status | Meaning in Seiya |
|---|---|
| `200` | Read or operation succeeded |
| `201` | Resource/proposal created (for example, finance-rule proposal) |
| `400` | Invalid request, validation error, or malformed JSON |
| `401` | Missing/invalid login session |
| `403` | Authenticated user is not allowed to access that household/action |
| `404` | Resource/conversation not found or intentionally not exposed to caller |
| `409` | Conflict, such as an existing pending finance agreement or an invalid execution state |
| `500` | Unexpected/backend/database failure |
| `502` | AI request could not be completed after provider orchestration |

Some APIs may map database errors differently. Frontend code should show a safe message and avoid depending on exact internal database error text.

## 9. Endpoint inventory

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Create account with full name + password | Public entry point |
| `POST` | `/api/auth/signin` | Sign in and establish session cookie | Public entry point |
| `GET` | `/api/auth/me` | Get current authenticated profile, active household, partner, and PIN status | Required |
| `POST` | `/api/auth/signout` | End local session | Required |
| `POST` | `/api/auth/pin/setup` | Configure user's 6-digit cryptographic PIN | Required |
| `POST` | `/api/auth/pin/verify` | Verify 6-digit PIN for sensitive dual-key actions | Required |
| `GET` | `/api/auth/pin/status` | Check if user has configured a security PIN | Required |
| `GET`, `POST` | `/api/onboarding` | Read/save onboarding responses and personalization | Required |
| `GET`, `POST` | `/api/households` | List user's active households / create household via RPC | Required |
| `POST` | `/api/households/invitations` | Create a single-use partner invitation link | Required; active owner required in RPC |
| `POST` | `/api/households/invitations/accept` | Join a household with an invitation token | Required |
| `GET` | `/api/households/[householdId]/promise` | Seiya's Promise status; drafts the shared clauses once both partners finished onboarding | Required active household member |
| `POST` | `/api/households/[householdId]/promise/response` | Save the caller's selected/edited clauses; identical versions activate the finance rules | Required active household member |
| `GET`, `POST` | `/api/households/[householdId]/finance-rules` | List/propose finance rules (supports both nested & contract fields) | Required active household member |
| `POST` | `/api/households/[householdId]/finance-rules/[ruleId]/decision` | Approve/reject a finance-rule proposal | Required eligible household member |
| `GET`, `POST` | `/api/households/[householdId]/wallets` | Read/initialize household wallets | Required active household member and active agreement for initialization |
| `GET`, `POST` | `/api/households/[householdId]/plans` | List/create couple goals & plans | Required active household member |
| `GET`, `PATCH`, `DELETE` | `/api/households/[householdId]/plans/[planId]` | Get, update, or delete a couple goal | Required active household member |
| `POST` | `/api/households/[householdId]/plans/[planId]/request-delete` | Request dual-key goal deletion (immediate with dual PIN or partner approval) | Required active household member |
| `GET`, `POST` | `/api/plans` | Convenience route for listing/creating couple goals | Required active household member |
| `GET`, `POST` | `/api/approvals` | List/create approval requests in unified queue | Required active household member |
| `POST` | `/api/approvals/[approvalId]/decision` | Approve/decline request (supports PIN, executes underlying action) | Required eligible approver |
| `GET`, `POST` | `/api/households/[householdId]/approvals` | Household-scoped approval queue | Required active household member |
| `GET`, `POST` | `/api/waiting-list` | List/create held purchases under cooling-off safeguard | Required active household member |
| `POST` | `/api/waiting-list/[heldId]/continue` | Release/continue held purchase (routes to approval if over threshold) | Required active household member |
| `POST` | `/api/waiting-list/[heldId]/cancel` | Cancel a held purchase | Required active household member |
| `GET`, `POST` | `/api/households/[householdId]/waiting-list` | Household-scoped held purchases list & creation | Required active household member |
| `GET`, `POST` | `/api/transactions` | List/record household transactions with auto-split & ledger settlement | Required active household member |
| `POST` | `/api/transactions/[transactionId]/undo` | Undo an eligible transaction within 10-minute window | Required active household member |
| `POST` | `/api/households/[householdId]/transactions` | Request a simulated transaction via RPC | Required; business rules apply |
| `POST` | `/api/transactions/[transactionId]/decision` | Approve/reject a transaction | Required eligible approver |
| `POST` | `/api/transactions/[transactionId]/execute` | Execute an eligible simulated transaction | Required and state/rules checked server-side |
| `GET`, `POST` | `/api/households/[householdId]/bills` | List/create bills | Required active household member |
| `PATCH`, `DELETE` | `/api/households/[householdId]/bills/[billId]` | Edit or delete a recurring bill | Required active household member |
| `POST` | `/api/households/[householdId]/bills/[billId]/pay` | Initiate bill payment from a simulated wallet | Required; transaction rules apply |
| `POST` | `/api/households/[householdId]/bills/[billId]/request-pay` | Mark bill as paid & request partner confirmation via approval queue | Required active household member |
| `GET` | `/api/households/[householdId]/bills/analyze` | Detect anomalies (duplicate streaming plans, price increases) | Required active household member |
| `GET`, `POST` | `/api/households/[householdId]/budgets` | List/create or upsert budgets | Required active household member |
| `GET`, `POST` | `/api/activities` | List activity/audit event history across gateway decisions and actions | Required active household member |
| `GET` | `/api/households/[householdId]/activities` | Household-scoped activity/audit event history | Required active household member |
| `GET` | `/api/settlement` | Get debt settlement balance (who owes whom) | Required active household member |
| `POST` | `/api/settlement/settle-up` | Settle up shared expense debt balance | Required active household member |
| `GET` | `/api/households/[householdId]/settlement` | Household-scoped debt settlement | Required active household member |
| `POST` | `/api/households/[householdId]/settlement/settle-up` | Household-scoped settle-up action | Required active household member |
| `POST` | `/api/gateway/decision` | Deterministic 8-step Rule Engine evaluation (ALLOW / NEED_APPROVAL / HOLD / DENY) | Required active household member |
| `POST` | `/api/households/[householdId]/gateway/decision` | Household-scoped gateway rule evaluation | Required active household member |
| `POST` | `/api/statement-import` | Upload bank statement (PDF, Excel, CSV) with preview & batch import | Required active household member |
| `POST` | `/api/households/[householdId]/statement-import` | Household-scoped bank statement parsing, categorization, and commit | Required active household member |
| `POST` | `/api/households/[householdId]/receipt-scan` | PDF e-receipt → draft via `unpdf` + rules; photo → vision-model fallback (used only when on-device OCR fails). Nothing is recorded | Required active household member |
| `POST` | `/api/ai/chat` | Run AI agent with conversational cards (ACTION_ALLOW, NEED_APPROVAL, HOLD) | Required active household member |

> **Important:** This inventory reflects endpoints implemented in the project during the build. For signup, onboarding, transactions, and budgets, verify exact body/property names against `src/backend/validators/*.ts` and the relevant route before wiring the UI; the UI must not infer missing fields.

## 10. Authentication

### `POST /api/auth/signup`

Creates an account from a **full name** and password (no email is collected):

```json
{ "fullName": "Reno Syaelendra", "password": "at-least-8-chars" }
```

- The name is normalized (NFKC, collapsed spaces, 2–100 characters) and mapped to an internal placeholder email `u-<sha256(lowercased name)[0:32]>@users.seiya.invalid` (domain overridable with `SEIYA_USERNAME_EMAIL_DOMAIN`).
- The account is created already confirmed through the Supabase admin API (`SUPABASE_SERVICE_ROLE_KEY`), then signed in so the session cookie is set.
- `409 USERNAME_TAKEN` when the name is already registered; `503` when the service-role key is not configured.
- Because names are the login identifier, two people with exactly the same full name cannot both register; they need to add a middle name or initial.

### `POST /api/auth/signin`

Signs in with `{ "fullName": "…", "password": "…" }` and sets the Supabase session cookie. Wrong name or password returns `401` with the message "Name or password is incorrect." No tokens are returned in JSON.

### `GET /api/auth/me`

Returns the signed-in user's profile, active household (with `myRole`), PIN status, and the partner's id and name. The partner is read through the `get_household_partner` RPC because `profiles` RLS only exposes the caller's own row. Without a valid session it returns `401`.

### `POST /api/auth/signout`

Ends the local Supabase session. After signout, `GET /api/auth/me` was tested to return `401`.

## 11. Onboarding and household setup

### `GET`, `POST /api/onboarding`

Reads or saves onboarding answers and profile preferences. Answers are stored in versioned `onboarding_responses` JSONB and include household discovery information such as country/city, money-talk patterns, income setup, wallet arrangement, and financial challenges.

Exact request field names should be checked in `src/backend/validators/onboarding.ts`. Do not store partner invitation tokens in onboarding answers.

#### Personalization answers (`answers.personalization`)

Onboarding questions are written in English; the stored keys are internal and are never rendered as research labels to the user. All fields are optional — a missing or invalid value is stored as `null` and that dimension simply does not personalize anything.

| Field | Item | Range / values |
| --- | --- | --- |
| `spendingHabit` | General money-spending habit | integer `1–11` |
| `paymentPain` | How often money still feels painful to spend | integer `1–5` |
| `planOvershoot` | Buying on impulse then regretting it | integer `1–5` |
| `wishPurchaseReaction` | Reaction at the register for a non-essential Rp500k item | integer `1–5` |
| `moneyMeaning` | What money is for | `rasa_aman`, `kebebasan`, `pengakuan`, `membantu_orang_lain` |
| `commStyle` | How money topics should be raised | `langsung`, `waktu_khusus`, `lewat_tulisan` |
| `permaGoal` | Shared priority for the year | `emosi_positif`, `keasyikan`, `hubungan`, `makna`, `pencapaian` |

The four scale items sum to 4–26 and are mapped to internal behavior bands server-side in `src/backend/personalization.ts` (`behaviorProfileKey`). The band key, its label, and the score are never written into the API response, chat output, or onboarding results; only the framing, tone, length, and emphasized reasons change. A partial scale returns `null`, which disables profiling instead of guessing.

Reading: `GET /api/onboarding` returns the user's own answers only (`onboarding_responses_select_own` RLS). A partner cannot read them.

### `POST /api/households`

Creates a household through `public.create_household(...)`. The RPC checks the caller's identity and prevents a user who already belongs to an active household from creating another active household. It creates an owner membership transactionally.

Request used in the security-test flow:

```json
{
  "name": "Seiya Security Test Household",
  "country": "Indonesia",
  "baseCurrency": "IDR"
}
```

The exact response nesting should be verified against `src/app/api/households/route.ts`. A common response in the test was parsed from `$createdHousehold.household.id`; do not assume all routes use the same wrapper.

### `POST /api/households/invitations`

Creates a single-use invitation link. Body: `{ "householdId": "<uuid>", "invitedName": "<optional partner name>" }` (`invitedEmail` is optional and no longer required). The response contains `success`, `message`, `invitation`, and `inviteUrl` (`APP_BASE_URL/invite?token=…`). When no email is given, a placeholder `invite-<hex>@invites.seiya.invalid` is stored.

The invitation URL contains a `token` query parameter. Treat the URL/token as a credential: do not log it, expose it to analytics, or send it to unrelated parties. The database stores a hash of the invitation token.

The current database workflow revokes the household's older pending invitation when a replacement invitation is created; tests observed the old invitation move from `pending` to `revoked`.

### `POST /api/households/invitations/accept`

Accepts an invitation for the signed-in user. The token alone identifies the invitation (no email match, since accounts use full names). Body:

```json
{ "token": "<invitation token from invite URL>" }
```

The successful response had top-level fields `success`, `message`, and `result`. The RPC checks expiry, invitation state, active owner status, household capacity, and that the user does not already belong to an active household.

## 12. Seiya's Promise

The couple's money agreement is drafted by Seiya's AI and agreed by both partners. Source: `src/backend/services/promise.service.ts`, `src/backend/validators/promise.ts`, `supabase/migrations/20261019090000_seiya_promise.sql`.

### `GET /api/households/[householdId]/promise`

Returns `{ success, myUserId, status }` where `status` has:

- `members`: each partner's `onboarding_done` and `history_done` (onboarding saved with `historyCompleted: true`).
- `promise`: `null` until both partners are done; then the shared draft (`clauses`, `status: "negotiating" | "active"`, `generated_by`).
- `responses`: each partner's saved selection.

When both partners are done and no draft exists, the route reads both onboarding answers with the service role (never returned to the client), asks the private-data AI providers for clauses, fills missing kinds from a deterministic template, and saves the draft (first writer wins).

Clause kinds: `common_goal`, `cost_sharing` (`params.ownerPercent`), `discuss_first` (`params.threshold`), `cooling_off` (`params.threshold`, `params.hours`), `family_support`, `data_privacy`, `check_in`, `emergency_fund`, `custom`. The partners' onboarding "discuss first" answer (lower of the two) is used as the starting `discuss_first` threshold.

### `POST /api/households/[householdId]/promise/response`

Body: `{ "selected": [PromiseClause, …] }` (1–20 clauses; numeric kinds must carry their params). Returns `outcome`:

- `waiting_partner`: the partner has not saved yet.
- `different`: both saved, versions differ; the UI marks the differing clauses for negotiation.
- `active`: both versions are identical. The numbers become a new active finance rule (both approvals recorded), older rules are superseded, the promise is marked active, and wallets can be initialized.

## 13. Financial Agreement

### `GET /api/households/[householdId]/finance-rules`

Returns the household's finance rules and approval records:

```json
{
  "success": true,
  "rules": [],
  "approvals": []
}
```

A rules record can contain `id`, `household_id`, `version`, `created_by`, `rules`, `status`, `created_at`, and `activated_at`. Approval records can contain `id`, `rule_id`, `user_id`, `decision`, `decided_at`, and `note`.

**Authorization:** `GET` now explicitly calls `is_household_member` after verifying the session and before querying rules. Nonmembers receive `403`; a valid member of the demo household received `200` and one active rule.

### `POST /api/households/[householdId]/finance-rules`

Submits a proposal for partner approval. Body shape:

```json
{
  "rules": {
    "walletMode": "shared_and_personal",
    "expenseSplit": {
      "mode": "equal",
      "ownerPercent": 50,
      "partnerPercent": 50
    },
    "approval": {
      "sharedWalletThreshold": 500000,
      "requirePartnerApprovalAboveThreshold": true
    },
    "coolingOff": {
      "enabled": true,
      "threshold": 1000000,
      "durationHours": 8
    }
  }
}
```

Numbers above are examples only. There is no hardcoded approval limit: `approval.sharedWalletThreshold` and `requirePartnerApprovalAboveThreshold` are whatever the household's mutually approved agreement says, and the backend reads the active rule version (never a fixed constant) when deciding whether an expense needs partner approval.

Response observed: `success`, `message`, and `rule`; a newly proposed rule had `status: "pending_approval"`. The proposer is approved as part of the proposal workflow; the agreement activates only after the required active household members approve.

The route validates UUID, authentication, body JSON, and finance rules. A membership check was added to both `GET` and `POST`; a nonmember POST was tested to return `403`, and member GET returned `200`.

### `POST /api/households/[householdId]/finance-rules/[ruleId]/decision`

Records an approval decision. The validator accepts `approved` or `rejected` (not `approve`/`reject`).

```json
{
  "decision": "approved",
  "note": "Approved for the household."
}
```

`note` may be a string or `null`; validator limit is 500 characters. On successful partner approval, the test proposal became `active`.

## 14. Wallets

### `GET /api/households/[householdId]/wallets`

Returns active wallets that the caller is allowed to see. A wallet record may include `id`, `household_id`, `wallet_type`, `owner_user_id`, `name`, `currency`, `simulated_balance`, `status`, and `created_at`.

Privacy rules observed in live testing:
- A member can see the shared wallet.
- A member can see their own personal wallet.
- The partner's personal wallet is not returned by the endpoint/RPC.

### `POST /api/households/[householdId]/wallets`

Initializes wallets based on the active Financial Agreement. Requires active membership, active household, active finance rules, exactly two active members, and a supported wallet mode.

Successful response observed:

```json
{
  "success": true,
  "message": "Household wallets initialized.",
  "result": {
    "wallets": [],
    "wallet_mode": "shared_and_personal",
    "household_id": "<uuid>",
    "created_count": 3
  }
}
```

The RPC created one shared and two personal wallets for `shared_and_personal`, with starting simulated balances of zero. The endpoint returned only the shared wallet and the caller's personal wallet, so two items in `result.wallets` can coexist with `created_count: 3`.

The RPC is idempotent: a second call was tested to return `created_count: 0`, and the number of `wallet.created` audit events remained 3.

## 15. Transactions

Routes:

- `POST /api/households/[householdId]/transactions` — request a simulated transaction.
- `POST /api/transactions/[transactionId]/decision` — approve/reject a pending transaction.
- `POST /api/transactions/[transactionId]/execute` — execute an eligible transaction.

The transaction engine was tested with the following behaviors:
- Balance updates are transactional/atomic through database RPCs.
- An idempotency key replay returns the original transaction rather than applying the same balance change twice.
- A shared-wallet expense above the active agreement's threshold can require partner approval.
- A transaction meeting the configured cooling-off condition can be placed `on_hold`; premature execution returns `409`.
- Rejected held transactions do not execute and do not change wallet balances.
- Transaction audit actions include events such as `transaction.requested`, `transaction.approved`, `transaction.rejected`, and `transaction.executed`.

**Frontend rules**
- Never decide that a transaction is approved based on the amount alone; render the server-provided transaction status and approval requirements.
- Use an idempotency key for transaction creation/payment requests. Reuse the *same* key when retrying the same user action after a timeout; do not generate a fresh key for a retry.
- The AI model must not directly execute a payment, approve, or reject anything. It may only create a transaction *request* through the same backend engine (`record_expense` in chat); the approval, cooling-off, and execution flow stays intact and server-enforced.

Exact request bodies, enum values, and response shapes for these three transaction routes: confirm in their route/validator files before implementing the UI.

## 16. Bills

### `GET /api/households/[householdId]/bills`

Returns household bills with fields such as `id`, `household_id`, `title`, `payee`, `amount`, `currency`, `due_date`, `recurrence`, `status`, `paid_transaction_id`, and `display_status`.

### `POST /api/households/[householdId]/bills`

Creates a bill through the business service/RPC. Tested body:

```json
{
  "title": "Internet bill demo",
  "payee": "Internet provider",
  "amount": 250000,
  "currency": "IDR",
  "dueDate": "2026-10-15",
  "recurrence": "monthly",
  "notes": "Demo bill"
}
```

Supported recurrence values in the database function are `none`, `weekly`, `monthly`, and `yearly`. In this MVP, recurrence is metadata: automatic creation of the next recurring bill has not been implemented.

Creation returns bill data; the database writes a `bill.created` audit event. New bill-created audit detail is minimized to a status value rather than duplicating amount, currency, date, title, payee, or notes.

### `POST /api/households/[householdId]/bills/[billId]/pay`

Starts the bill-payment workflow using a simulated wallet. Body used in test:

```json
{
  "walletId": "<shared wallet UUID>",
  "idempotencyKey": "<unique key for this payment action>"
}
```

Successful response includes `success`, `message`, and `result` with `bill`, `transaction`, and `idempotent_replay`. When a one-time simulated bill payment executed successfully, the bill status changed to `paid` and an audit event `bill.status_changed` recorded `from_status`, `to_status`, and `changed_fields` without repeating bill amount.

## 17. Budgets

### `GET /api/households/[householdId]/budgets`

Returns budgets with progress fields including `spent`, `amount`, `remaining`, `over_budget`, and `usage_percent`. A demo grocery budget was verified at IDR 1,000,000, spent IDR 650,000, remaining IDR 350,000, usage 65%.

### `POST /api/households/[householdId]/budgets`

Creates or updates a budget through the backend/database function. The business flow records `budget.upserted` in the audit log.

Exact request fields and full response body: confirm in `src/backend/validators/bill-budget.ts` and `src/app/api/households/[householdId]/budgets/route.ts` before wiring a form.

## 18. Couple Goals & Plans (`/api/plans` & `/api/households/[householdId]/plans`)

Provides collaborative long-term goal planning and dual-key dissolution matching the [FINTECHATHON.pdf](FINTECHATHON.pdf) specifications:

- `GET /api/plans` or `GET /api/households/[householdId]/plans`: returns all household plans with `targetAmount`, `currentAmount`, `currency`, `recommendedMonthly`, `splitRecommendation`, `walletFunding`, `status`, `assumptions`.
- `POST /api/plans` or `POST /api/households/[householdId]/plans`: creates a financial plan (`CreatePlanInput`).
- `GET /api/households/[householdId]/plans/[planId]`: inspects a single plan.
- `PATCH /api/households/[householdId]/plans/[planId]`: adjusts target amount, target date, monthly recommendation, or status (`UpdatePlanInput`).
- `DELETE /api/households/[householdId]/plans/[planId]`: deletes a goal.
- `POST /api/households/[householdId]/plans/[planId]/request-delete`: Dual-Key deletion request. If both `partnerAPin` and `partnerBPin` (6-digit PINs) are provided in-person, immediately dissolves the goal. If initiated by one partner, creates an approval request in the unified approvals queue of type `PLAN_DELETE`.

## 19. Dual-Key Approvals Queue (`/api/approvals` & `/api/households/[householdId]/approvals`)

The unified action queue for all collaborative decisions requiring partner consent (Bills, Plans, Expenses, Contracts):

- `GET /api/approvals`: returns all pending and historical approval requests for the caller's household.
- `POST /api/approvals`: creates an approval request (`title`, `amount`, `currency`, `wallet`, `requesterRole`, `approverRole`, `category`, `type`, `targetId`, `reason`).
- `POST /api/approvals/[approvalId]/decision`: approve or decline an approval request:
  - **Self-approval defense (S09):** A requester is cryptographically prevented from approving their own request (`SELF_APPROVAL` rejected with HTTP 403).
  - **PIN verification (S13):** If a 6-digit PIN is supplied, verifies against the approver's stored PIN hash.
  - **Atomic execution:** Approving a `BILL` marks the bill as paid and debits the shared wallet; approving `PLAN_DELETE` dissolves the goal; approving `EXPENSE` debits the shared wallet; approving `CONTRACT` activates the proposed contract terms.
  - Declining resets the underlying target status (e.g. bill returns to `upcoming`).

## 20. Waiting List & Held Purchases (`/api/waiting-list`)

Supports the emotional cooling-off safeguard for late-night impulse purchases:

- `GET /api/waiting-list`: lists all active held purchases with `holdUntil`, `amount`, `currency`, `wallet`, and `reason`.
- `POST /api/waiting-list/[heldId]/continue`: user confirms intent after cooling-off period. If amount exceeds the shared approval threshold, automatically routes to partner approval (`NEED_APPROVAL`); otherwise executes directly (`ALLOW`) and debits the wallet.
- `POST /api/waiting-list/[heldId]/cancel`: cancels the held purchase and writes an audit event.

## 21. Activities & Decision Log (`/api/activities`)

Real-time decision and activity stream tracking all agent decisions, safeguard interventions, and partner approvals:

- `GET /api/activities`: returns recent activity entries with `id`, `title`, `category`, `actor` (`partner_a` | `partner_b` | `seiya`), `status` (`ALLOW` | `NEED_APPROVAL` | `HOLD` | `DENY` | `INFO`), `amount`, `currency`, `reason`, and timestamp.

## 22. Shared Expense Settlement (`/api/settlement`)

Maintains the mutual ledger balance (who owes whom) based on transaction split ratios:

- `GET /api/settlement`: returns `partnerBOwesA`, `partnerAOwesB`, and `currency`.
- `POST /api/settlement/settle-up`: resets mutual debt balances to zero and logs an audit activity.

## 23. Dual-Key Security PIN (`/api/auth/pin`)

Cryptographic 6-digit PIN protection for sensitive financial decisions (dissolving shared goals, approving high-value transactions):

- `POST /api/auth/pin/setup`: hashes and sets the caller's 6-digit PIN (`pin`).
- `POST /api/auth/pin/verify`: verifies the caller's or partner's PIN.
- `GET /api/auth/pin/status`: returns `{ hasPin: boolean }`.

## 24. Deterministic Gateway Decision API (`/api/gateway/decision`)

Direct HTTP endpoint for the 8-step Rule Engine specified in [FINTECHATHON.pdf](FINTECHATHON.pdf) (pages 26-27):

- `POST /api/gateway/decision`: evaluates `actionType` (`EXPENSE` | `BILL_PAY` | `PURCHASE` | `EXTERNAL_TRANSFER` | `PRIVACY_REQUEST`), `title`, `amount`, `currency`, `wallet`, `timeOfDay`, and `category`.
- Returns `{ success: true, decision: { outcome, reason_code, reason, details } }`:
  - `EXTERNAL_TRANSFER` -> `DENY` (`DEST_NOT_ALLOWED`)
  - `PRIVACY_REQUEST` -> `DENY` (`PRIVACY_BLOCK`)
  - Late-night impulse threshold -> `HOLD` (`EMOTION_HOLD`)
  - Exceeds shared threshold -> `NEED_APPROVAL` (`SHARED_OVER_THRESHOLD`)
  - Compliant -> `ALLOW` (`WITHIN_RULES` / `LEDGER_ONLY`)

## 25. Statement Import & Historical Extraction (`/api/statement-import` & `/api/households/[householdId]/statement-import`)

Allows couples to bootstrap their initial spending history and starting balances right after onboarding by uploading bank or e-wallet statements (PDF, Excel, CSV):

- **Architecture:** Two-stage hybrid pipeline:
  1. *Deterministic Local Extraction (0 LLM Tokens):* Raw text and tabular transactions are parsed in-memory using `unpdf` (PDFs) and `xlsx` (Excel/CSV) with 100% numerical accuracy and zero token costs.
  2. *Categorization & Title Cleaning:* Heuristic pattern-matching runs first for instant mapping (< 1ms). For ambiguous merchants, an optional small-batch AI task cleans the title and maps it to standard categories (`Food & Drinks`, `Shopping`, `Bills`, `Transportation`, `Health`, `Social`, `Others`, `Income`).
- `POST /api/households/[householdId]/statement-import` or `POST /api/statement-import`:
  - **Multipart form upload:** accepts `file` (PDF, XLSX, CSV), `dryRun` (`true` | `false`), `walletType` (`shared` | `personal`), `paidBy` (`partner_a` | `partner_b`), and `useAi` (`true` | `false`).
  - **Preview mode (`dryRun=true`):** returns extracted transactions without inserting rows into the database so the couple can review on screen first.
  - **Commit mode (`dryRun=false` or JSON batch payload):** calls transactional RPC `import_statement_batch` to atomically insert transactions with `status = 'executed'`, updates wallet balance with the net delta, and logs an audit activity event.

## 26. AI Agent and RAG

### `POST /api/ai/chat`

Tested request shape:

```json
{
  "householdId": "<household UUID>",
  "conversationId": "<optional existing private conversation UUID>",
  "message": "Summarize our household budget."
}
```

`conversationId` is optional for a new conversation. Reuse the returned conversation ID to continue that conversation. The tested API response contains:

```json
{
  "success": true,
  "message": "<assistant response>",
  "conversationId": "<uuid>",
  "historySaved": true,
  "meta": {
    "provider": "groq",
    "latencyMs": 1533,
    "toolsUsed": ["get_budget_summary"],
    "usage": {
      "inputTokens": 944,
      "outputTokens": 249,
      "totalTokens": 1193
    },
    "usageByProvider": {},
    "modelCalls": 2,
    "rag": {
      "status": "skipped",
      "cacheHit": false,
      "latencyMs": 0,
      "resultCount": 0,
      "sources": []
    }
  }
}
```

Values above illustrate the response shape, not fixed values.

Available read-only tools tested:
- `get_wallet_summary`
- `get_budget_summary`
- `list_upcoming_bills`
- `get_household_rules`
- `list_recent_transactions`
- `get_plans_summary`
- `check_affordability`
- `get_settlement_summary`
- `list_pending_approvals`
- `list_held_purchases`

### Chat-time expense recording (`record_expense`)

A chat message such as `hari ini aku liburan ke Jepang habis 20 juta` can be recorded in the same turn. This is handled by the agent's single write tool, `record_expense`:

- **Gate:** the tool schema is only offered when the message contains an explicit money amount plus a spending action, and no plan/question/hypothetical marker (`nanti`, `mau beli`, `misal`, `rencana`, `berapa harga`, …). The model may still decline and ask for the amount instead. If the model returns no tool call for such a message, the API answers with a fixed "kirim ulang dengan nominal" message instead of the raw model text, so no recording can be claimed falsely.
- **Not a bypass:** the tool calls the same `request_simulated_transaction` RPC as `POST /api/households/[householdId]/transactions`. The active agreement still decides the outcome — `executed`, `pending_approval`, or `on_hold` — and the tool result repeats that status verbatim. Approval decisions and held-transaction execution remain in their own endpoints; the AI never approves, rejects, or executes anything.
- **Wallet resolution:** `wallet: "shared"` picks the household shared wallet; `wallet: "personal"` picks only the authenticated sender's own personal wallet. A currency mismatch, an IDR amount below `1000` (wrong unit, e.g. `20 juta` written as `20`), a non-slug category, or a missing wallet returns an error result instead of recording.
- **Category:** a lowercase slug (`travel`, `food`, `groceries`, `transport`, `shopping`, `entertainment`, `health`, `utilities`, `education`, `subscriptions`, `gifts`, `bills`, `other`), which is what budget matching compares against.
- **Idempotency:** the key is derived server-side from `user + household + message + parsed expense` (SHA-256, `ai-expense-<hex>`). A retried or resent identical message reports the stored transaction instead of creating a second one; a `P1003` conflict falls back to reading the existing row.
- **Result contract:** the tool returns `ok`, `recorded`, optional `duplicate`, `transaction.status`, and an Indonesian `status_note`. If the RPC returns an unexpected status, the tool returns `ok: false` rather than letting the model claim success.

Not yet tested end-to-end against a live database: recording an expense, an insufficient-balance rejection, and the duplicate-send path. Verify before documenting as verified.

### Response personalization and wellbeing override

The chat turn loads the caller's own latest completed onboarding response and appends one private system block (`src/backend/personalization.ts`):

- **Facts never change.** Numbers, Janji Seiya rules, and the available options are identical for every user; only framing, tone, length, and the emphasized reason adjust. The block forbids naming any internal label, research term, score, band, or onboarding answer in the reply.
- **Profile styling** comes from the Part A total (4–11 / 12–18 / 19–26): permission-and-safety with medium calming length, or shortest fact-only, or short-and-light with at most one emoji — including the avoid-lists (scary risk numbers, long lectures, scolding words).
- **Layers:** `moneyMeaning` picks the reason framing, `commStyle` decides whether to answer immediately, park it for money date, or lead with a written recap, and `permaGoal` is mentioned only when relevant.
- **Shared summaries:** if the user asks for a summary to open together with the partner, the block requires the neutral style so neither partner feels singled out.
- **Wellbeing override:** `detectWellnessState` scans the message. `stress` builds a single neutral, calm, number-light block for everyone and skips profiling entirely. `crisis` additionally disables every tool for that turn (no balances, no numbers, no `record_expense`), forbids product/loan offers and any notification to the partner, and redirects to professional counseling/crisis help. The crisis path returns the model's supportive text without financial-data claims.
- **Privacy:** the style block and wellness state are server-side only; neither appears in the response body, `meta`, or stored conversation content beyond the assistant text itself.

Crisis and counseling contact lists are **not yet verified by the team**; the model is instructed to mention only services already verified by Seiya and never to invent names or numbers. Do not ship a real crisis list before that verification.

Agent behavior tested:
- Greeting: one model call, no tool call.
- Budget question: tool call fetches live SQL-derived data, then model writes the answer.
- Wallet question: `get_wallet_summary` supplies current balances and respects personal-wallet privacy.
- Conceptual question on cooling-off: RAG returned 3 chunks and answered without database tools.
- Repeating the same conceptual question inside the same server process hit the retrieval cache.
- Financial-data request: RAG was skipped and a database tool was used.
- Private conversation access by the other partner was rejected (`404` in the tested cross-user attempt).

`meta.rag` can include `status`, `cacheHit`, `latencyMs`, `resultCount`, `sources`, and, on a cache hit, `queryEmbeddingTokens`. Do not assume every metadata property is present on every provider/path.

### RAG knowledge updates

Knowledge source of truth is in `knowledge/seiya/*.md`. Each `##` section is a chunk. After editing content:

1. Preview parsing:

   ```powershell
   node scripts/seed/seiya-rag.mjs --dry-run
   ```

2. Copy the rotated Supabase seed key into clipboard and run seed (keep the key out of Git, source files, logs, and chat):

   ```powershell
   $env:SEIYA_RAG_SEED_KEY = (Get-Clipboard -Raw).Trim()
   try {
       node --env-file=.env.local scripts/seed/seiya-rag.mjs
   }
   finally {
       Remove-Item Env:SEIYA_RAG_SEED_KEY -ErrorAction SilentlyContinue
       Set-Clipboard -Value "clipboard cleared"
   }
   ```

3. The current seed script embeds new/changed chunks; unchanged chunks are skipped. Do not edit the vector table manually.

The current RAG knowledge base uses `gemini-embedding-001` with 768-dimensional vectors and Supabase `pgvector`. Document and query embeddings must use the same model/dimension. RAG is for static Seiya explanations/financial education; actual balances, transactions, budgets, bills, and active rules must come from database tools.

## 27. Security and privacy requirements for frontend

1. Treat `householdId`, `conversationId`, `ruleId`, `billId`, `transactionId`, and `walletId` from the browser as untrusted input. The server must authenticate and authorize each operation.
2. Never assume possession of a UUID proves access. APIs should verify active household membership and rely on database RLS/RPC checks as defense in depth.
3. A household member can view shared-wallet information and their own personal wallet; do not expose a partner's personal wallet.
4. Private AI conversations belong to the creating user. Household membership alone does not grant access to a partner's private conversation.
5. Do not expose Supabase service-role/secret keys, Groq/Gemini/Mistral/Cloudflare/OpenRouter keys, invitation tokens, cookie values, or server environment variables in frontend code or analytics.
6. Do not log prompts, financial payloads, invite URLs, access tokens, or secret values in the browser or server logs. Server diagnostics should be structured and minimized.
7. Financial agreement, partner approvals, cooling-off, transaction creation, and transaction execution must remain enforced by backend/database rules, never by UI state or an AI model's textual assertion.
8. For API errors, show a user-safe message; do not surface raw SQL or provider error bodies in the UI.
9. After an operation times out, consult its status/idempotency result before retrying with a new key.
10. Onboarding answers (behavior scale, money meaning, communication style, priorities) are private to their owner: never return another partner's answers, never expose the derived behavior band or label in chat, API responses, logs, or onboarding results, and never use them to decide different facts or options for different users.

## 28. Current verification status and known gaps

### Verified in the development project

- `npx tsc --noEmit` passed during AI/RAG integration stages (rerun after later edits before final release).
- Authenticated/unauthenticated API checks: unauthenticated AI chat was rejected with `401`.
- Nonexistent/unowned household checks returned `403` on tested endpoints.
- A household nonmember received `403` for Wallets, Bills, Budgets, Finance Rules (after explicit route membership check), and AI Chat.
- Regression matrix passed `12/12`: the demo household owner and security-test household owner received `200` on their own household's Wallets/Bills/Budgets/Finance Rules; the demo owner received `403` on the other household's four endpoints.
- Finance Rules GET and POST membership checks were tested; nonmember POST returned `403`.
- Bill creation/pay and audit events `bill.created`, `bill.status_changed` were verified.
- Household creation/member add, invitation create/revoke/accept, and three wallet-created events were verified.
- Wallet initialization retry returned `created_count: 0`; the count of `wallet.created` events remained 3.
- Provider failover Groq → Gemini was tested by configuring an intentionally invalid Groq model (404). Gemini successfully called `get_wallet_summary` and saved the conversation.
- RAG seed inserted 10 sections; cooling-off retrieval, retrieval cache hit, and RAG skip for wallet-balance questions were tested.

### Not yet proven / still recommended

- A specific simulated HTTP `429` rate-limit test for the AI fallback path has **not** been run. Do not tell users this case is verified.
- Full property-based or concurrency testing of RLS/RPCs has not been done.
- The RAG similarity cutoff still needs an evaluation set: cooling-off retrieval returned two less-relevant chunks as well as the best match.
- PowerShell output showed Unicode mojibake such as `Rpâ¯`; check response/terminal encoding separately rather than altering financial calculations.
- Chat personalization (profile styling, money meaning, communication style, PERMA goal) and the wellbeing override are implemented but **not yet verified end-to-end**: no test compares two profiles on the same situation, and no test exercises the stress/crisis path.
- The current request limiter is in-process, not a distributed/global limiter across multiple server instances.
- Recurring bills are metadata only; the next recurrence is not automatically generated.
- The frontend is integrated with every API route; the two-partner onboarding → Seiya's Promise → wallets flow still needs a full manual run with two real accounts in production.

## 29. Recommended frontend implementation order

1. Auth screens: signup, signin, signout, session/profile check.
2. Onboarding: GET/POST onboarding.
3. Household setup: create household, partner invitation, accept invitation.
4. Agreement screen: show current/proposed rules and each approval; allow `approved` / `rejected` decisions.
5. Wallet, budget, bill screens: render server-returned values and status; never infer state client-side.
6. Transaction flow: draft/request → show approval/hold → partner decision if required → execute only through the existing backend endpoint.
7. AI chat: include `householdId`, optional `conversationId`, and `message`; render `message`, loading/errors, and optional RAG source metadata. Keep tool calls invisible as raw internals unless the product UX explicitly exposes a safe activity summary.
8. Security/error states: handle `401`, `403`, `404`, `409`, `429`, `500`, and `502` distinctly.

Before release, the frontend and backend developers should cross-check the exact request/response fields for endpoints marked **confirm in source**, then run the 12-case cross-household matrix and an HTTP 429 fallback test in a controlled environment.

## 30. Manual terminal tests

Six scripts in `scripts/test/` drive the real API (sign-in cookies + RLS-scoped Supabase reads) and print PASS/WARN/FAIL per assertion. They run against the dev server, not a mock, and they create real rows in the development Supabase project.

**Prerequisite:** the dev server must be running first.

```powershell
npm run dev          # terminal 1
npm run test:setup   # terminal 2 — one-shot account/household/agreement check
```

| Command | What it proves |
| --- | --- |
| `npm run test:setup` | Test accounts, household, partner membership, **active** finance agreement, wallets. Run this first when anything else fails during setup. |
| `npm run test:personalization` | Same message → three onboarding profiles. Asserts: internal band labels never appear, emoji per profile limits, unconflicted stays shortest, `record_expense` never offered for discussion messages. |
| `npm run test:wellness` | Stress + crisis messages with the strongest profile applied. Asserts: no currency numbers, no tools, no emoji, no loan/product offer, professional-help pointer, no internal labels. |
| `npm run test:expense` | `"hari ini aku habis Rp20 juta untuk liburan ke Jepang"` → `record_expense` → row in `transactions` with category `travel` and status from the active agreement (`pending_approval` above the Rp5 juta test threshold); identical resend stays a single row; a personal wallet with zero balance is never faked. |
| `npm run test:statement` | Bank statement parsing (CSV, Excel `.xlsx`) with 0-token extraction, automatic merchant title cleaning, category mapping (`Food & Drinks`, `Shopping`, `Bills`, `Transportation`, `Income`), preview mode (`dryRun`), and atomic batch commit to Supabase. |
| `npm run test:security` | Two-partner security pass: personal-wallet privacy (API and direct RLS), IDOR on another household (403), approve needs the approver's PIN on every route, wrong/missing PIN and self-approval rejected, PIN cannot be replaced without the current one, requester can cancel a pending request, cooling-off cannot be skipped, undo restores balance, double-click bill payment debits once, a shared goal cannot be deleted by one partner. |
| `npm run test:chat` | Runs the three scenario scripts back to back. |

All of them accept the same overrides when you do not want the defaults:

```powershell
$env:SEIYA_TEST_NAME_A = "Seiya Tester A"   # full name = username
$env:SEIYA_TEST_NAME_B = "Seiya Tester B"
$env:SEIYA_TEST_PASSWORD = "<password>"
$env:SEIYA_TEST_PIN = "246810"             # 6-digit PIN used by test:security
$env:SEIYA_TEST_BASE_URL = "http://localhost:3000"
npm run test:setup
```

**First-run account caveat (read before reporting a failure):** the harness signs in with full names (`Seiya Tester A` / `Seiya Tester B`) and `SEIYA_TEST_PASSWORD` (default `SeiyaTest123!`), the same way the app does. With `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` it creates both accounts already confirmed, so no email is involved. `test:security` sets the test PIN on accounts that have none yet. These values are read only by the scripts, never by application code.

Each script exits non-zero when a hard assertion fails; WARN lines (tone, emoji count, length ordering) are model-dependent and are meant to be eyeballed in the printed replies.
