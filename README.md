# Seiya Backend API Reference

> **Audience:** Frontend developer integrating the Seiya Next.js app.
>
> **Scope:** Backend routes and behaviors established during implementation and live tests in the Seiya project. Check the corresponding route and validator source before relying on any field marked **confirm in source**. This document is an integration guide, not a substitute for server-side authorization.

## 1. Project and integration conventions

- Project root used during development: `F:\Web Project\seiya`
- Application: Next.js App Router, TypeScript, Supabase Auth/Database.
- Backend code organization:
  - `src/app/api/**/route.ts` — HTTP endpoints.
  - `src/backend/services/**` — business logic.
  - `src/backend/validators/**` — request validation.
  - `src/backend/agents/**` — AI provider router and agent orchestration.
  - `src/backend/rag/**` — knowledge retrieval.
- The application uses cookie-backed Supabase sessions through `@supabase/ssr`. The frontend should call the same-origin API and preserve cookies. Do not send a service-role key or provider API key to the browser.
- Local base URL used in examples: `http://localhost:3000`.
- Financial operations in Seiya are **simulated**. No endpoint in this MVP moves real money.

## 2. Environment variables

All runtime secrets and configuration are read from environment variables (typically `.env.local`). **Never commit actual key values to source control.** The `.gitignore` blocks `.env*` and whitelists only the empty `.env.example` template.

### Supabase

| Variable | Required | Sensitivity | Description |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Public | Supabase project URL (e.g. `https://<ref>.supabase.co`). Exposed to the browser via `NEXT_PUBLIC_` prefix. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Yes | Public | Supabase publishable (anon) key. Safe for client-side; row-level security enforces access. |

### AI provider keys (server-only, **secret**)

Each key is read at runtime by its provider adapter. The router skips unconfigured providers.

| Variable | Provider | Description |
|---|---|---|
| `GROQ_API_KEY` | Groq | API key from [console.groq.com/keys](https://console.groq.com/keys) |
| `GOOGLE_API_KEY` | Gemini | API key from [aistudio.google.com/api-keys](https://aistudio.google.com/api-keys). Also used by the RAG embedding pipeline. |
| `MISTRAL_API_KEY` | Mistral AI | API key from [console.mistral.ai/api-keys](https://console.mistral.ai/api-keys) |
| `OPENROUTER_API_KEY` | OpenRouter | API key from [openrouter.ai/workspaces/default/keys](https://openrouter.ai/workspaces/default/keys) |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Workers AI | API token from [Cloudflare dashboard](https://dash.cloudflare.com/) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare Workers AI | Cloudflare account ID (not a secret, but paired with the token) |

### AI orchestration (server-only, non-secret)

| Variable | Default | Description |
|---|---|---|
| `SEIYA_AI_PROVIDER_ORDER` | `groq,gemini,mistral,openrouter,cloudflare` | Comma-separated provider IDs defining the fallback order. |
| `SEIYA_AI_PRIVATE_PROVIDER_ALLOWLIST` | `groq,gemini,mistral` | Providers allowed to handle private/financial data. Others are skipped for `private` classification. |
| `SEIYA_AI_PROVIDER_TIMEOUT_MS` | `7000` | Per-provider HTTP timeout in milliseconds (clamped 1500–12000). |
| `SEIYA_AI_MAX_PROVIDER_ATTEMPTS` | `4` | Maximum number of provider attempts including fallbacks (clamped 1–5). |
| `SEIYA_AI_PROVIDER_COOLDOWN_MS` | `30000` | Cooldown period before retrying a recently failed provider (clamped 5000–600000). |
| `SEIYA_AI_GROQ_MODEL` | `openai/gpt-oss-20b` | Model ID for Groq. |
| `SEIYA_AI_GEMINI_MODEL` | `gemini-3.8-flash` | Model ID for Gemini. |
| `SEIYA_AI_MISTRAL_MODEL` | `ministral-8b-latest` | Model ID for Mistral. |
| `SEIYA_AI_OPENROUTER_MODEL` | `nvidia/nemotron-3.5-lightning` | Model ID for OpenRouter. |
| `SEIYA_AI_CLOUDFLARE_MODEL` | `@cf/meta/llama-3.2-1b-instruct` | Model ID for Cloudflare Workers AI. |
| `SEIYA_AI_CLOUDFLARE_ENABLE_TOOLS` | `false` | Set `true` to allow Cloudflare provider to declare tool support. |

### Application

| Variable | Default | Description |
|---|---|---|
| `APP_BASE_URL` | `http://localhost:3000` | Used for generating invitation URLs and as OpenRouter HTTP-Referer. |

### Script-only variables (not needed at runtime)

These are used by seed/admin scripts and should be supplied in the current shell session, **never saved in `.env.local`**.

| Variable | Script | Description |
|---|---|---|
| `SEIYA_RAG_SEED_KEY` | `scripts/seed-seiya-rag.mjs` | Supabase service-role or secret key for upserting RAG knowledge chunks. Pass via clipboard; clear after use. |
| `SUPABASE_SERVICE_ROLE_KEY` | `scripts/seed-dummy-users.mjs`, `scripts/seed-seiya-rag.mjs` | Fallback for `SEIYA_RAG_SEED_KEY`. Same handling rules apply. |
| `SUPABASE_SECRET_KEY` | `scripts/seed-dummy-users.mjs` | Alternative name for service-role key (legacy Supabase naming). |
| `SEIYA_DUMMY_PASSWORD` | `scripts/seed-dummy-users.mjs` | Password for dummy test accounts created by the seed script. |

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

## 2. Endpoint inventory

| Method | Endpoint | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Create account | Public entry point |
| `POST` | `/api/auth/signin` | Sign in and establish session cookie | Public entry point |
| `GET` | `/api/auth/me` | Get current authenticated profile | Required |
| `POST` | `/api/auth/signout` | End local session | Required |
| `GET`, `POST` | `/api/onboarding` | Read/save onboarding responses | Required |
| `POST` | `/api/households` | Create household via RPC | Required |
| `POST` | `/api/households/invitations` | Create partner invitation | Required owner/member per server policy; active owner required in RPC |
| `POST` | `/api/households/invitations/accept` | Accept invitation for the signed-in email | Required; invited email must match |
| `GET`, `POST` | `/api/households/[householdId]/finance-rules` | List/propose finance rules | Required active household member |
| `POST` | `/api/households/[householdId]/finance-rules/[ruleId]/decision` | Approve/reject a finance-rule proposal | Required eligible household member |
| `GET`, `POST` | `/api/households/[householdId]/wallets` | Read/initialize household wallets | Required active household member and active agreement for initialization |
| `POST` | `/api/households/[householdId]/transactions` | Request a simulated transaction | Required; business rules apply |
| `POST` | `/api/transactions/[transactionId]/decision` | Approve/reject a transaction | Required eligible approver |
| `POST` | `/api/transactions/[transactionId]/execute` | Execute an eligible simulated transaction | Required and state/rules checked server-side |
| `GET`, `POST` | `/api/households/[householdId]/bills` | List/create bills | Required active household member |
| `POST` | `/api/households/[householdId]/bills/[billId]/pay` | Initiate bill payment from a simulated wallet | Required; transaction rules apply |
| `GET`, `POST` | `/api/households/[householdId]/budgets` | List/create or upsert budgets | Required active household member |
| `POST` | `/api/ai/chat` | Run AI agent for a household | Required active household member |

> **Important:** This inventory reflects endpoints implemented in the project during the build. For signup, onboarding, transactions, and budgets, verify exact body/property names against `src/backend/validators/*.ts` and the relevant route before wiring the UI; the UI must not infer missing fields.

## 3. Authentication

### `POST /api/auth/signup`

Creates a Supabase Auth account. Signup associates `full_name` metadata with the account, and a database trigger creates the profile. Email confirmation was disabled for the local/demo project during development.

**Frontend notes**
- Do not depend on production email-confirmation settings matching local/demo settings.
- Exact request property names and response shape: **confirm in** `src/backend/validators/auth.ts` and `src/app/api/auth/signup/route.ts`.

### `POST /api/auth/signin`

Signs in with email/password and establishes the Supabase session using cookies. The endpoint does not return access tokens in its JSON response.

Exact body/response contract: check `src/backend/validators/auth.ts` and `src/app/api/auth/signin/route.ts`.

### `GET /api/auth/me`

Returns the signed-in user's profile/session identity. The route uses Supabase `getUser()` to verify the session. A request without a valid session was tested to return `401`.

### `POST /api/auth/signout`

Ends the local Supabase session. After signout, `GET /api/auth/me` was tested to return `401`.

## 4. Onboarding and household setup

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

Creates a household invitation for an email address. The response observed during testing had these fields: `success`, `message`, `invitation`, and `inviteUrl`. The invitation included an ID and status `pending`.

The invitation URL contains a `token` query parameter. Treat the URL/token as a credential: do not log it, expose it to analytics, or send it to unrelated parties. The database stores a hash of the invitation token.

The current database workflow revokes the household's older pending invitation when a replacement invitation is created; tests observed the old invitation move from `pending` to `revoked`.

### `POST /api/households/invitations/accept`

Accepts an invitation for the signed-in user. The signed-in email must match the invited email. In the PowerShell test, the body sent was:

```json
{ "token": "<invitation token from invite URL>" }
```

The successful response had top-level fields `success`, `message`, and `result`. The RPC checks expiry, invitation state, active owner status, household capacity, and that the user does not already belong to an active household.

## 5. Financial Agreement

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

## 6. Wallets

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

## 7. Transactions

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

## 8. Bills

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

## 9. Budgets

### `GET /api/households/[householdId]/budgets`

Returns budgets with progress fields including `spent`, `amount`, `remaining`, `over_budget`, and `usage_percent`. A demo grocery budget was verified at IDR 1,000,000, spent IDR 650,000, remaining IDR 350,000, usage 65%.

### `POST /api/households/[householdId]/budgets`

Creates or updates a budget through the backend/database function. The business flow records `budget.upserted` in the audit log.

Exact request fields and full response body: confirm in `src/backend/validators/bill-budget.ts` and `src/app/api/households/[householdId]/budgets/route.ts` before wiring a form.

## 10. AI Agent and RAG

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
   node scripts/seed-seiya-rag.mjs --dry-run
   ```

2. Copy the rotated Supabase seed key into clipboard and run seed (keep the key out of Git, source files, logs, and chat):

   ```powershell
   $env:SEIYA_RAG_SEED_KEY = (Get-Clipboard -Raw).Trim()
   try {
       node --env-file=.env.local scripts/seed-seiya-rag.mjs
   }
   finally {
       Remove-Item Env:SEIYA_RAG_SEED_KEY -ErrorAction SilentlyContinue
       Set-Clipboard -Value "clipboard cleared"
   }
   ```

3. The current seed script embeds new/changed chunks; unchanged chunks are skipped. Do not edit the vector table manually.

The current RAG knowledge base uses `gemini-embedding-001` with 768-dimensional vectors and Supabase `pgvector`. Document and query embeddings must use the same model/dimension. RAG is for static Seiya explanations/financial education; actual balances, transactions, budgets, bills, and active rules must come from database tools.

## 11. Security and privacy requirements for frontend

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

## 12. Current verification status and known gaps

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
- The full frontend has not yet been integrated end-to-end.

## 13. Recommended frontend implementation order

1. Auth screens: signup, signin, signout, session/profile check.
2. Onboarding: GET/POST onboarding.
3. Household setup: create household, partner invitation, accept invitation.
4. Agreement screen: show current/proposed rules and each approval; allow `approved` / `rejected` decisions.
5. Wallet, budget, bill screens: render server-returned values and status; never infer state client-side.
6. Transaction flow: draft/request → show approval/hold → partner decision if required → execute only through the existing backend endpoint.
7. AI chat: include `householdId`, optional `conversationId`, and `message`; render `message`, loading/errors, and optional RAG source metadata. Keep tool calls invisible as raw internals unless the product UX explicitly exposes a safe activity summary.
8. Security/error states: handle `401`, `403`, `404`, `409`, `429`, `500`, and `502` distinctly.

Before release, the frontend and backend developers should cross-check the exact request/response fields for endpoints marked **confirm in source**, then run the 12-case cross-household matrix and an HTTP 429 fallback test in a controlled environment.

## 14. Manual terminal tests

Four scripts in `scripts/` drive the real API (signup cookies + RLS-scoped Supabase reads) and print PASS/WARN/FAIL per assertion. They run against the dev server, not a mock, and they create real rows in the development Supabase project.

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
| `npm run test:chat` | Runs the three scenario scripts back to back. |

All of them accept the same overrides when you do not want the defaults:

```powershell
$env:SEIYA_TEST_EMAIL_A = "suami@gmail.com"   # akun yang SUDAH terkonfirmasi
$env:SEIYA_TEST_EMAIL_B = "istri@gmail.com"
$env:SEIYA_TEST_PASSWORD = "<password>"
$env:SEIYA_TEST_BASE_URL = "http://localhost:3000"
npm run test:setup
```

**First-run account caveat (read before reporting a failure):** the harness signs up `seiya.test.a@gmail.com` / `seiya.test.b@gmail.com` with `SEIYA_TEST_PASSWORD` (default `SeiyaTest123!`). This project sends a confirmation email, so either confirm both inboxes once, or add `SUPABASE_SECRET_KEY` (service role) to `.env.local` so the harness creates and confirms both accounts itself. GoTrue rejects `example.com`-style domains, and the dev project's email quota can be exhausted (`over_email_send_rate_limit`) — in that case point the overrides above at accounts you already have. None of these secrets are read by application code, only by the scripts.

Each script exits non-zero when a hard assertion fails; WARN lines (tone, emoji count, length ordering) are model-dependent and are meant to be eyeballed in the printed replies.
