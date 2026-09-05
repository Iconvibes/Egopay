# EgoPay Digital Bank — Backend

A production-style **digital banking backend** built for the TS Academy Backend Engineering Assignment. It integrates with the **NibssByPhoenix simulated NIBSS API** to deliver the complete customer journey: registration, BVN/NIN KYC verification, account creation (₦15,000 pre-funded), balance checks, name enquiry, intra- and inter-bank transfers, transaction status (TSQ) and transaction history — with strict customer data isolation throughout.

> ⚠️ **Simulation project.** This is a training exercise built against the provided NibssByPhoenix sandbox API. It is **not** production banking infrastructure. Only synthetic test identities are used — never real BVN/NIN data.

**Live API reference:** the official Swagger docs for the sandbox are at <https://nibssbyphoenix.onrender.com/api/docs/>. All 12 documented endpoints are integrated (see §6). The docs are a skeleton — several response shapes and auth details were verified live and normalized in this project (see §6 notes).

---

## 1. Project overview

The backend exposes a clean REST API for the bank's mobile/web frontend. All banking operations are delegated to **NibssByPhoenix** (a simulated NIBSS):

| Capability | How it works |
|---|---|
| Customer onboarding | Email/password registration + BVN **or** NIN verification through NibssByPhoenix's identity store |
| Account creation | Only after successful KYC. One account per customer, enforced by the database. Pre-funded with ₦15,000 by NibssByPhoenix |
| Balance | Live ledger balance fetched from NibssByPhoenix; local copy kept as a cache |
| Name enquiry | Recipient resolved through NibssByPhoenix before any transfer |
| Transfers | Intra-bank and inter-bank, always after mandatory name enquiry |
| Transaction status | NibssByPhoenix TSQ endpoint, synced into the local record |
| Transaction history | Own transactions only, paginated/filterable, credits included |
| Incoming payments | Ledger-vs-cache reconciliation (poller + on-refresh) → `INCOMING/CREDIT` transaction + `Payment received` alert |
| Transfer alerts | Every settlement (SUCCESS **or** FAILED, including late PENDING → resolved via TSQ) fires a bell/toast/OS alert |

---

## 2. Architecture

A modular monolith — no microservices, no unnecessary infrastructure.

```
routes (express routers)
  → controllers (HTTP handling, no business logic)
    → services (business rules, transaction workflow)
      → NibssByPhoenix client (the ONLY module that talks to the external API)
      → Prisma / PostgreSQL (persistence)
```

```
src/
├── config/env.ts                 # validated environment configuration (zod)
├── lib/                          # prisma client, logger (pino + redaction), AppError, DTO helpers
├── middleware/                   # requireAuth (JWT), zod validation, error handler, rate limiting, 404
├── modules/
│   ├── auth/                     # register, login, me
│   ├── onboarding/               # BVN / NIN verification, verification status
│   ├── account/                  # account creation, my account, my balance
│   ├── transfer/                 # name enquiry, transfers
│   ├── transaction/              # history, detail, TSQ status
│   ├── notification/             # in-app alerts: incoming credits + transfer outcomes
│   └── dev/                      # identity seeding utilities (admin-key protected)
└── services/nibss/               # NibssByPhoenix client: JWT lifecycle, typed endpoints, error normalization
services/balanceSync.ts           # ledger-vs-cache reconciliation (incoming-payment detection)
services/balancePoller.ts         # background poller driving the reconciliation
scripts/                          # db launcher (embedded PostgreSQL), fintech onboarding, live smoke test
prisma/schema.prisma              # database schema + migrations
postman/                          # Postman collection for the full journey
```

**Key architectural decisions**

- **The NibssByPhoenix client is the only place that makes HTTP calls to the external API.** Controllers and services never see axios or raw payloads. The client normalizes the (inconsistent) upstream response shapes into typed contracts.
- **Sender identity is always derived from the authenticated session.** No account-number, customer-id or `from` field in a request body is ever trusted for ownership — see [Security](#7-security).
- **Transactions are recorded locally before the external call** and their status is updated *only* from the external response (PENDING → SUCCESS/FAILED). Timeouts leave the record PENDING because the outcome is genuinely unknown — the system never fabricates results.
- **Customer JWT and fintech JWT are separate concerns.** The customer JWT (signed with `JWT_SECRET`) authenticates the app's users; the fintech JWT (obtained from `/api/auth/token`) authenticates the *bank* to NibssByPhoenix and is cached with a 1-hour expiry-aware refresh.

---

## 3. Technology stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20+ (built on Node 24) |
| Language | TypeScript (strict) |
| HTTP framework | Express 5 |
| Database | PostgreSQL 14+ |
| ORM | Prisma 6 (migrations committed) |
| Validation | Zod |
| Auth | JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`) |
| External API | Axios with timeouts |
| Security | Helmet, CORS allowlist, express-rate-limit, request size limits |
| Logging | Pino with sensitive-field redaction |
| Verification | Live smoke script against the real API (see [Testing](#10-testing--verification)) |

---

## 4. Setup

### Prerequisites

- Node.js **20+** and npm
- PostgreSQL **14+** — **or** use the bundled helper below (no system install needed)

### 1. Install

```bash
git clone <your-repo-url>
cd egopay-bank
npm install
```

### 2. Start the development environment

The single development command starts the bundled PostgreSQL database when it is not already running, applies pending Prisma migrations, starts the API, and starts the frontend:

```bash
npm run dev
```

Open the frontend at <http://localhost:5173>. API requests are proxied to <http://localhost:4000>.

The database runs on `127.0.0.1:5433` with data under `.local/postgres-data` (gitignored). If a compatible database is already running on that port, the development command reuses it.

To start only the database manually, use:

```bash
npm run db:start
```

To use your own PostgreSQL instead:

Create a database and point `DATABASE_URL` at it (e.g. via Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:16`).

### 3. Configure environment

```bash
cp .env.example .env
```

Fill in `.env` (never commit it). The two critical values are the NibssByPhoenix fintech credentials:

```bash
# Obtain real credentials from the live training API (documented onboarding step):
npm run onboard -- --name "Your Bank Name" --email you@example.com
```

Copy the printed `NIBSS_API_KEY` / `NIBSS_API_SECRET` into `.env`. (Credentials are also emailed by the service.)

### 4. Apply migrations and run

```bash
npm run dev                # starts the database, migrations, API, and frontend
```

Verify: `curl http://localhost:4000/api/health`

### Production build

```bash
npm run build && npm start
```

---

## 5. Environment variables

See [.env.example](.env.example) for the full annotated list:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Customer-JWT signing secret (≥16 chars) |
| `NIBSS_BASE_URL` | ✅ | `https://nibssbyphoenix.onrender.com` |
| `NIBSS_API_KEY` / `NIBSS_API_SECRET` | ✅ | Fintech credentials from the onboarding step |
| `PORT` | | Default `4000` |
| `NIBSS_TIMEOUT_MS` | | External call timeout (default 20000) |
| `NIBSS_TOKEN_REFRESH_LEEWAY_S` | | Refresh fintech JWT this early (default 60s) |
| `CORS_ORIGIN` | | `*` or comma-separated allowlist |
| `DEV_ADMIN_KEY` | | Admin key for identity-seeding endpoints (empty = disabled) |
| `LOG_LEVEL`, rate-limit vars | | Tuning |

Missing or invalid configuration **fails fast at startup** with a clear message.

### Demo KYC flow

BVN and NIN verification uses the NibssByPhoenix sandbox identity store; it does not generate real government IDs. In development, the KYC screen shows **Create a demo BVN/NIN**. That action:

1. Creates a synthetic identity in the sandbox through `/api/dev/seed-bvn` or `/api/dev/seed-nin`.
2. Prefills the generated 11-digit number and matching date of birth.
3. Verifies that identity through `/api/onboarding/bvn` or `/api/onboarding/nin`.

The seeded first and last name match the newly registered customer, because the backend checks the name and date of birth before completing KYC. The helper requires the same local key in both files: `DEV_ADMIN_KEY` in `.env` and `VITE_ADMIN_KEY` in `frontend/.env`. Restart `npm run dev` after changing either file. These endpoints are development utilities and should remain disabled in production.

---

## 6. API endpoints

All responses use `{ error: { code, message, details? } }` for failures. `Authorization: Bearer <token>` refers to the **customer** JWT from `/api/auth/login`.

### Auth

**POST `/api/auth/register`** — public
```json
{ "email": "ada@example.com", "password": "Password123", "firstName": "Ada", "lastName": "Okafor", "phone": "08011112222" }
```
`201` → `{ message, customer: { id, email, firstName, lastName, phone, kyc: { verified, type, number, verifiedAt }, createdAt } }`
Errors: `400` invalid body · `409` duplicate email

**POST `/api/auth/login`** — public
```json
{ "email": "ada@example.com", "password": "Password123" }
```
`200` → `{ message, token, tokenType: "Bearer", customer }` · Errors: `400`, `401` invalid credentials

**GET `/api/auth/me`** — customer JWT → current profile. Errors: `401`

### Onboarding / KYC

**POST `/api/onboarding/bvn`** — customer JWT
```json
{ "bvn": "99900000101", "dob": "1992-06-15" }
```
`200` → `{ message, customer }` with `kyc.verified: true` and a **masked** `kyc.number` (`999****0101`). The identity returned by NibssByPhoenix is cross-checked against the registered name and provided DOB.
Errors: `400` format / upstream rejection · `409` already verified · `422` identity mismatch (`KYC_MISMATCH`)

**POST `/api/onboarding/nin`** — customer JWT — same contract with `{ nin, dob }`.

**GET `/api/onboarding/status`** — customer JWT → current verification state.

### Accounts

**POST `/api/accounts`** — customer JWT, empty body. Creates the single account via NibssByPhoenix.
`201` → `{ message, account: { id, accountNumber, accountName, bankCode, bankName, currency, balance: 15000, createdAt } }`
Errors: `403 KYC_REQUIRED` (unverified) · `409 ACCOUNT_EXISTS` / `IDENTITY_LINKED` (duplicate) · `400`/`502`/`504` upstream

**GET `/api/accounts/me`** — customer JWT → own account. Errors: `404 NO_ACCOUNT`

**GET `/api/accounts/me/balance`** — customer JWT → **live** balance from NibssByPhoenix (local cache synced). The account queried is always the session's own — there is no account-number parameter. Also reconciles incoming payments (see *Notifications* below).

### Transfers

**GET `/api/transfers/name-enquiry/:accountNumber`** — customer JWT
`200` → `{ recipient: { accountNumber, accountName, bankCode, bankName } }` · Errors: `400` bad format · `404 RECIPIENT_NOT_FOUND`

**POST `/api/transfers`** — customer JWT. Sender is always the session's account.
```json
{ "to": "2867654321", "amount": 2000, "narration": "lunch money" }
```
`200` → `{ message, transaction: { id, reference, from, to, recipientName, amount, type, status, narration, createdAt, completedAt } }`
Errors: `400` validation / `SELF_TRANSFER` / `INSUFFICIENT_FUNDS` / `TRANSFER_REJECTED` · `404 RECIPIENT_NOT_FOUND` / `NO_ACCOUNT` · `504 TRANSFER_OUTCOME_UNKNOWN` (stays `PENDING` — check status later)

### Transactions

**GET `/api/transactions?page=1&limit=20&status=SUCCESS&type=INTRABANK`** — customer JWT. Own history only.
`200` → `{ items: [...], pagination: { page, limit, total, pages } }`

**GET `/api/transactions/:id`** — customer JWT. Own transaction only; anyone else's id → `403 TRANSACTION_ACCESS_DENIED`.

**GET `/api/transactions/:id/status`** — customer JWT. Queries the NibssByPhoenix **TSQ** endpoint with the stored `reference` and syncs the local record. Ownership enforced before the external call.

### Notifications (in-app alerts)

**GET `/api/notifications?unreadOnly=true`** — customer JWT. Own alerts, newest first → `{ items, unreadCount }`. Items carry a `kind` (`INCOMING_CREDIT` · `OUTGOING_SUCCESS` · `OUTGOING_FAILED`) so the UI can style them (green in / green out / red failed).

**POST `/api/notifications/read-all`** — customer JWT. Marks all own notifications as read.

**POST `/api/notifications/:id/read`** — customer JWT. Marks one own notification as read (any other customer's id → `404`).

**Incoming-payment detection:** the external API has no webhook and no "incoming transactions" listing, so EgoPay *detects* money arriving on the ledger by reconciling the live balance against its local cache. A background poller (`BALANCE_POLL_INTERVAL_S`, default 10s) plus every user-initiated balance refresh run this reconciliation; a positive delta (the ledger rose beyond what this app itself sent out) is recorded as an `INCOMING`/`CREDIT` transaction and a `Payment received` notification. Try it: `npm run incoming:demo` sends synthetic money into the first local account from a freshly onboarded sender bank — watch the toast, the bell badge, and the green `+₦` history row.

**Outgoing-transfer alerts (debit alerts):** every transfer settlement mirrors the incoming pipeline. An immediate `SUCCESS` fires *"Transfer successful — You sent ₦X to …"*; an upstream rejection (e.g. insufficient funds) is recorded as `FAILED` and fires a red *"Transfer failed"* alert. A transfer that times out stays `PENDING` and is **not** alerted yet — when it later resolves via the TSQ status sync (PENDING → SUCCESS/FAILED), the alert fires then, so no outcome goes unannounced. Alert creation is best-effort and never fails the transfer itself.

### Dev utilities (testing)

**POST `/api/dev/seed-bvn`** / **POST `/api/dev/seed-nin`** — `x-admin-key: <DEV_ADMIN_KEY>` header.
Registers a synthetic identity record in the NibssByPhoenix identity store (the documented *"BANK Admin registers BVN & NIN"* step). Disabled (`404`) when `DEV_ADMIN_KEY` is unset.

---

## 7. NibssByPhoenix integration

All 12 documented endpoints are integrated through `src/services/nibss/`:

| NibssByPhoenix endpoint | Used by |
|---|---|
| `POST /api/fintech/onboard` | `scripts/onboard.ts` (credential bootstrap) |
| `POST /api/auth/token` | Client JWT lifecycle (camelCase `apiKey`/`apiSecret` — see below) |
| `POST /api/account/create` | Account creation |
| `GET /api/account/name-enquiry/{no}` | Recipient verification before transfers |
| `GET /api/accounts` | Client (admin listing; not currently exposed in the app API) |
| `GET /api/account/balance/{no}` | Balance checks + cache sync |
| `POST /api/transfer` | Transfers |
| `GET /api/transaction/{id}` | Transaction status (TSQ) |
| `POST /api/insertBvn` / `insertNin` | Dev identity seeding |
| `POST /api/validateBvn` / `validateNin` | KYC verification |

### Endpoint reference (verified live)

Request/response shapes below were captured from the running sandbox on 2026-09-04 (the Swagger UI only documents request bodies, so responses come from live probing). `bearer` = fintech JWT from `POST /api/auth/token`.

**Identity store — no auth required**

**`POST /api/insertBvn`** — register a BVN identity (the *"BANK admin registers BVN"* step).
Request: `{ bvn, firstName, lastName, dob, phone? }` · Response: the identity record.
EgoPay mapping: `NibssClient.insertBvn` → `POST /api/dev/seed-bvn` (admin-gated dev endpoint).

**`POST /api/insertNin`** — register a NIN identity.
Request: `{ nin, firstName, lastName, dob }` · Response: the identity record.
EgoPay mapping: `NibssClient.insertNin` → `POST /api/dev/seed-nin`.

**`POST /api/validateBvn`** — verify a BVN.
Request: `{ bvn }` · Response: `{ firstName, lastName, dob, ... }`. ⚠️ Auto-creates a record for unknown BVNs.
EgoPay mapping: `NibssClient.validateBvn` → `POST /api/onboarding/bvn` — cross-checks the returned name/DOB against the identity store before marking KYC verified (and masks the number in every response).

**`POST /api/validateNin`** — verify a NIN.
Request: `{ nin }` · Response: identity record. ⚠️ Fails `400` for unregistered NINs.
EgoPay mapping: `NibssClient.validateNin` → `POST /api/onboarding/nin` — same name/DOB cross-check as BVN.

**Fintech lifecycle — no auth required**

**`POST /api/fintech/onboard`** — onboard a fintech and receive API credentials.
Request: `{ name, email }` · Response: `{ apiKey, apiSecret, bankCode, ... }` (credentials also emailed).
EgoPay mapping: `NibssClient.onboardFintech` → `scripts/onboard.ts` — the credential-bootstrap step documented in §4.

**`POST /api/auth/token`** — exchange credentials for a JWT (valid **1 hour**).
Request: `{ apiKey, apiSecret }` — **camelCase** (the PDF shows lowercase, which the live API rejects) · Response: `{ token }`.
EgoPay mapping: `NibssClient.login` — the client caches the token and refreshes it before expiry (see *Fintech JWT lifecycle* below); customers never see it.

**Accounts & payments — bearer JWT required**

**`POST /api/account/create`** — open an account from a registered identity.
Request: `{ kycType: "bvn" | "nin", kycID, dob }` · Response: `{ message, account: { accountNumber, accountName, bankCode, bankName, balance: 15000, ... } }` (nested; the PDF's flat shape is wrong). Duplicate identity → `400 "bvn already linked to an account"`.
EgoPay mapping: `NibssClient.createAccount` → `POST /api/accounts` — requires KYC first; one account per customer enforced by a DB unique constraint; the duplicate-identity `400` is surfaced as `409 IDENTITY_LINKED`.

**`GET /api/account/name-enquiry/{accountNumber}`** — resolve an account to a name.
Response: `{ accountName, accountNumber, bankCode?, bankName? }` (works across fintechs on the shared ledger).
EgoPay mapping: `NibssClient.nameEnquiry` → `GET /api/transfers/name-enquiry/:accountNumber` — mandatory before every transfer; unknown accounts → `404 RECIPIENT_NOT_FOUND`.

**`GET /api/accounts`** — list every account the fintech opened.
Response: `{ accounts: [...] }`.
EgoPay mapping: `NibssClient.listAccounts` — deliberately **not** exposed through the app API (customers must never enumerate accounts); exercised in tests only.

**`GET /api/account/balance/{accountNumber}`** — live ledger balance.
Response: `{ accountName, accountNumber, balance }`.
EgoPay mapping: `NibssClient.getBalance` → `GET /api/accounts/me/balance`, the background poller, and post-transfer sync — the single reconciliation point behind balance checks **and** incoming-payment detection (§6).

**`POST /api/transfer`** — move funds between any two accounts on the ledger.
Request: `{ from, to, amount }` (a `narration` field is accepted by the live API though absent from the docs) · Response: `{ reference, senderAccount, receiverAccount, amount, status, _id, createdAt }` — **`reference` is the TSQ** (the PDF calls it `transactionId`).
EgoPay mapping: `NibssClient.transfer` → `POST /api/transfers` — sender is always the session's own account; local record moves `PENDING → SUCCESS/FAILED` only from the upstream response (timeouts stay `PENDING`, never guessed).

**`GET /api/transaction/{ref}`** — query a transfer by TSQ reference.
Response: `{ reference, status, senderAccount?, receiverAccount?, amount?, ... }`.
EgoPay mapping: `NibssClient.getTransactionStatus` → `GET /api/transactions/:id/status` — syncs the local record from the upstream status (ownership enforced before the external call).

**Fintech JWT lifecycle.** The client logs in with the configured `NIBSS_API_KEY`/`NIBSS_API_SECRET`, caches the token, and refreshes it before its 1-hour expiry (configurable leeway). A long-running process does not re-authenticate on every request.

**Documented-vs-live discrepancies** (verified against the running API on 2026-09-04 — the live API wins):

1. `POST /api/auth/token` expects **camelCase** `apiKey`/`apiSecret`; the PDF shows lowercase `apikey`/`apisecret`, which the live API rejects.
2. Transfer/TSQ responses use **`reference`** (e.g. `TX1788534036759`), not `transactionId`; the sender/receiver fields are `senderAccount`/`receiverAccount`.
3. `POST /api/account/create` returns the account nested under **`account`** (`{ message, account: { accountNumber, accountName, bankCode, balance, ... } }`).
4. BVN/NIN insert & validation endpoints require **no** JWT (the PDF summary table is correct here; the per-endpoint sections conflict — both behaviors were tested).
5. `validateBvn` **auto-creates** a record for unknown BVNs; `validateNin` fails with `400` for unregistered NINs. Both behaviors are normalized; the app additionally enforces name/DOB cross-checks so "verification" is meaningful.

---

## 8. Customer journey

```
1. Register            POST /api/auth/register
2. Login               POST /api/auth/login          → customer JWT
3. Verify KYC          POST /api/onboarding/bvn  OR  /api/onboarding/nin
   (identity seeded first via POST /api/dev/seed-bvn|nin with x-admin-key)
4. Create account      POST /api/accounts            → ₦15,000 pre-funded
5. Check balance       GET  /api/accounts/me/balance
6. Name enquiry        GET  /api/transfers/name-enquiry/:accountNumber
7. Transfer            POST /api/transfers           → TSQ reference stored
8. Transaction status  GET  /api/transactions/:id/status
9. History             GET  /api/transactions
```

The Postman collection in [`postman/`](postman/) walks this exact journey with test scripts and documented synthetic identities.

---

## 9. Security

**Customer data isolation (IDOR/BOLA).** The most important requirement:

- **Server-side ownership derivation.** The customer id comes exclusively from the verified JWT. The API surface has *no* account-number or customer-id parameters for reading balances, accounts, or initiating transfers — an injected `from`/`accountNumber`/`customerId` in the body or query is ignored or rejected (covered by tests).
- **Ownership-scoped queries.** Every transaction lookup is `findFirst({ where: { id, customerId } })` — another customer's transaction id returns `403 TRANSACTION_ACCESS_DENIED`, indistinguishable from a non-existent id.
- **One account per customer** — enforced by a DB unique constraint (`Account.customerId @unique`) in addition to service-level checks.
- **One identity per customer** — `Customer.kycNumber @unique` prevents a second customer from registering the same BVN/NIN.

Other measures:

- Passwords hashed with **bcrypt (12 rounds)**; never logged or returned.
- **JWT**: signed with a strong secret, expiry enforced; invalid/expired tokens → `401`.
- **No secrets in code or logs**: fintech credentials live in `.env` (gitignored); pino redacts passwords, API keys, KYC numbers, tokens, and authorization headers.
- **KYC numbers masked** in every response (`999****0101`).
- **Validation** of all input (zod): email, password strength, 11-digit BVN/NIN, DOB sanity, 10-digit account numbers, positive amounts (≤ 2dp), pagination bounds.
- **Rate limiting** on all routes, stricter on credential endpoints; **helmet** headers; **CORS** allowlist; 100kb body limit; `X-Request-Id` tracing.
- **Centralized error handling** — stack traces and upstream payloads never reach clients; upstream errors are normalized (`400/404/409` → clean app errors, `5xx`/timeouts → `502`/`504`).

---

## 10. Testing / verification

The automated unit suite (72 tests: auth, KYC, accounts, transfers, TSQ, Nibss-client unit tests, and the customer A-vs-B data-isolation suite) was developed and passed locally, but is **not shipped in the submission package** per the submission requirements.

### Balance-reconciler unit suite (`npm test`)

A focused [vitest](https://vitest.dev) suite for `src/services/balanceSync.ts` — the ledger-vs-cache reconciler behind balance checks and incoming-payment detection — lives in `tests/balanceSync.test.ts` (**12 tests**, all mocked: prisma singleton, Nibss client, logger; no DB or network). It pins the race/outage behavior that live demos cannot:

- **Duplicate-credit races** — concurrent syncs for one account share a single in-flight outcome (exactly one CREDIT row); a `P2002` unique-constraint collision on the synthetic `INCOMING-…` reference falls back to a cache-only resync (`creditDetected: false`); and consecutive syncs never double-record because the cache baseline moves forward.
- **Negative deltas** — a ledger *below* the cache (shouldn't happen — only this app debits) resyncs the cache to the ledger without fabricating a credit, and warns; sub-kobo noise is ignored.
- **Nibss outages** — upstream failures propagate without any local write; the per-account in-flight entry is cleaned up so the next poll retries; the best-effort variant swallows the failure for fire-and-forget call sites.

Run with `npm test`. The suite sits under `tests/` (excluded from the backend build via `tsconfig.json`) — delete that folder and the `vitest` devDependency if the submission must not ship test files.

### Measured traffic profile (app API, after the loop fix)

Recorded 2026-09-05 against the running app (single logged-in user, real NibssByPhoenix ledger, balance poller + notification poller active). Counts are **app-API requests only** (`/api/*`); upstream Nibss calls happen out-of-band from the server:

| Activity | App-API requests |
|---|---|
| Idle on the dashboard (steady state) | **~4/min** — the single shared notification poller every 15 s (nothing while logged out) |
| Dashboard mount | 2 (live balance + recent transactions); cold boot adds `auth/me` + `accounts/me` |
| Pull-to-refresh | 2 (balance + recent transactions) |
| Outgoing transfer via the UI | 2 (name enquiry + transfer); the settlement alert rides the standing poll |
| Incoming payment | ~0 extra — detection is a poller-side ledger check; measured **~7 s** from settlement to the `Payment received` alert |

With the default rate limit of **1,000 requests / 15 min per client**, steady-state idle (240/min·window) leaves ~4 h of continuous dashboard uptime before the window refills — and **zero `429` responses were observed** across this full journey (incoming credit + successful send + rejected send + pull-to-refresh). Compare the pre-fix behavior: an effect keyed on a fresh `account` object identity caused an infinite fetch loop (~4 req/s, exhausting the window in minutes) — fixed by keying on `account.id` and by identity-preserving auth-context setters (§13).

### Live smoke test (`npm run smoke:live`)

The included verification path runs the **entire journey against the real NibssByPhoenix API** (server + DB must be running): seeds fresh identities, registers/logs in, verifies BVN & NIN, creates accounts, checks the ₦15,000 balance, transfers intra-bank and **inter-bank** (by onboarding a second fintech on the fly), queries TSQ, and verifies data-isolation rules. **Result: 38/38 passed** against the live API on 2026-09-04.

---

## 11. Assumptions & decisions

- **Verification semantics.** `validateBvn` in this sandbox auto-creates records for unknown BVNs, so "verified" is enforced by (a) the upstream response and (b) cross-checking the registered name and provided DOB against the returned identity record (`422` on mismatch). NIN verification additionally fails when the NIN is not registered.
- **Authorization error style.** Cross-customer resource access returns `403` with a clear message (rather than `404`) to make the isolation behavior explicit. Transaction ids are server-generated cuid values, so no information leaks.
- **`from` is never accepted.** The transfer endpoint takes only `to`/`amount`/`narration`; the sender is the session's account.
- **DOB validation** requires a real calendar date, not in the future, year ≥ 1900. No age-floor is enforced (the assignment does not require one).
- **Pending semantics.** A transfer that times out locally stays `PENDING` — never guessed as success or failure. The customer can poll the TSQ status endpoint.
- **Fintech JWT caching** with leeway refresh (documented above) instead of login-per-request.
- **`GET /api/accounts`** (all accounts listing) is implemented in the client but not exposed through the app API — customers must never enumerate other accounts. It is exercised in unit tests only.

## 12. Known limitations

- The sandbox API occasionally returns transient 5xx or stalls; the client times out and maps these to clean `502/504` responses.
- Inter-bank transfers require a recipient account at another bank — the smoke test creates one automatically; manually, use an account from a colleague's onboarded bank.
- Rate limits are in-memory per process (fine for this monolith; use Redis-backed store for multi-instance production).
- No webhooks — incoming payments are *detected* via balance reconciliation and outgoing transfers alert on settlement (see §6 Notifications); the TSQ endpoint covers reconciliation for interrupted transfers.

---

## 13. Frontend (OPay-inspired mobile app)

A React + Vite + TypeScript web app in [`frontend/`](frontend/) styled after the OPay app — **EgoPay royal-blue identity**, branded splash animation, card-based home screen with a live balance card, pull-to-refresh, dark mode, quick actions grid, and a fixed bottom navigation (Home · Send · History · Profile).

It implements the complete journey through the API:

- **Auth** — OPay-style sign-in / create-account screen with tab switcher
- **KYC** — BVN/NIN segmented picker, masked-identity notice, and a one-click *"Use a demo test identity"* helper (seeds a fresh synthetic BVN/NIN via the dev endpoints when `VITE_ADMIN_KEY` is set, so demos always work)
- **Account opening** — welcome-credit screen (₦15,000), one-tap creation
- **Dashboard** — live balance (auto-refreshed from the ledger on mount), hide-balance toggle, **pull-to-refresh**, quick actions, recent transactions
- **Polish** — branded splash-screen animation on load, **route transitions via the View Transitions API** (every navigation — taps, `navigate()`, guard redirects, back/forward — runs a true cross-fade where the outgoing page fades/slides out while the new one slides in; browsers without `document.startViewTransition` fall back to the keyed fade + slide-up replay, shell/nav stay mounted), and **dark mode** (toggle on Home/Profile, persisted, follows system preference by default; all of it respects `prefers-reduced-motion` — reduced-motion users get an instant page swap instead)
- **Send money** — recipient → name enquiry → amount/narration → review → confirm → success screen with the TSQ reference; insufficient-funds and other errors surface inline
- **Name enquiry**, **Transaction status** (TSQ, with refresh), **History** (status/type filters + pagination, green `+₦` credit rows), **Profile** (account details, verified-identity card, sign out), **Notifications** (bell with unread badge, live toasts, notification center with kind-styled icons)
- **Money alerts, both directions** — incoming payments toast *"You received ₦X"* (green credit row in history), successful sends toast *"You sent ₦X to …"*, and failed sends (e.g. insufficient funds) toast in red *"Transfer failed"* — all through one shared poller with 429 auto-backoff
- **PWA** — installable (web manifest + generated 192/512/maskable icons), offline-capable via a service worker (app shell precache + runtime caching; `/api` is never cached), and **OS-level payment alerts**: enable alerts on the Notifications screen and incoming *and* outgoing payments fire a real system notification even with the app tab in the background
- **Custom install prompt** — the browser's automatic install UI is suppressed and the `beforeinstallprompt` event is deferred; the Dashboard shows an in-app *"Add EgoPay to your home screen"* card (logo, blurb, Install + dismiss) only when the app is genuinely installable and not already installed. Install re-uses the captured event from the button's user gesture; accepting hides the card for the session, dismissing persists across visits, and installing from anywhere (`appinstalled`) retires it permanently

Every screen was exercised end-to-end against the **live** backend + NibssByPhoenix API: register → BVN verify → open account (₦15,000) → inter-bank transfer (TSQ captured) → TSQ status → balance updated to ₦12,500 → insufficient-funds error path.

### Run the whole app on one port

The built frontend is served **statically by the Express backend**, so the entire app runs on a single port with no separate Vite dev server:

```bash
npm run db:start          # terminal 1 — database
npm run build:frontend    # once — compiles the React app into frontend/dist
npm run dev               # terminal 2 — whole app on http://localhost:4000
```

Open **http://localhost:4000** — the API is at `/api/*`, the web app at `/`. During frontend development you can instead run `npm run dev:frontend` (Vite on :5173, proxying `/api` to the backend). Optional: `cp frontend/.env.example frontend/.env` and set `VITE_ADMIN_KEY` to match the backend's `DEV_ADMIN_KEY` to enable the demo identity helper.

Production build: `npm run build:all` → backend to `dist/`, static assets to `frontend/dist/`; `npm start` serves both.

Frontend effect hygiene is enforced by ESLint (`frontend/eslint.config.js`): `npm --prefix frontend run lint` runs `react-hooks/rules-of-hooks` and `react-hooks/exhaustive-deps` as **errors** so an effect that gains an unstable dependency (the class of bug behind the Dashboard's historical infinite fetch loop) fails the check. Identity-churn loops are additionally structurally prevented: the auth context's `account`/`customer` setters preserve object identity when the fetched data is unchanged, so effects keyed on those objects cannot re-fire endlessly.

The PWA pieces (`frontend/public/manifest.webmanifest`, `frontend/public/sw.js`, `frontend/public/icons/*.png`) are copied into `frontend/dist` by the Vite build. Regenerate the icons (they're generated, dependency-free) with `npm run icons`.

---

## 14. Repository hygiene

- `.env` (with real credentials) is gitignored. Only `.env.example` with placeholders is committed.
- Migrations are committed under `prisma/migrations/`.
- The Postman collection documents the complete evaluator journey with synthetic test data.

---

## 15. Deploying to Vercel + Supabase

The whole app (frontend + API) runs on Vercel with Supabase as the Postgres host — one URL to share, no server to manage.

### 15.1 Supabase (database)

1. Create a project at <https://supabase.com> (free tier is fine).
2. Copy the **connection pooler** string: Project Settings → Database → Connection string → **Prisma** tab. It looks like:
   ```
   postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true
   ```
   Use the pooler (port `6543`) — serverless functions open many short-lived connections and the pooler prevents connection exhaustion.
3. Apply the migrations from your machine once (against the Supabase URL):
   ```bash
   DATABASE_URL="<supabase-pooler-url>" npx prisma migrate deploy
   ```

### 15.2 Vercel (frontend + API)

1. Push this repo to GitHub, then import it at <https://vercel.com/new>. Vercel reads `vercel.json` automatically:
   - `frontend/` builds to static files (the SPA, served at the domain root).
   - `api/index.ts` becomes a serverless function; all `/api/*` requests are rewritten to it.
2. Set these **Environment Variables** (Production + Preview) in Vercel → Project → Settings → Environment Variables:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Supabase pooler URL from §15.1 |
   | `JWT_SECRET` | long random string (`openssl rand -hex 32`) |
   | `NIBSS_API_KEY` / `NIBSS_API_SECRET` | your fintech credentials from `npm run onboard` |
   | `NIBSS_BASE_URL` | `https://nibssbyphoenix.onrender.com` (default) |
   | `CRON_SECRET` | long random string — enables + guards `/api/cron/reconcile` |
   | `DEV_ADMIN_KEY` | long random string — enables the seed-identity endpoint (see §15.3) |
   | `VITE_ADMIN_KEY` | same value as `DEV_ADMIN_KEY` — shows the "test identity" helper on the KYC screen |
   | `CORS_ORIGIN` | `*` (frontend and API share one origin on Vercel) |

   `@prisma/client` is generated automatically on install via the `postinstall` script.
3. Deploy. The **balance-reconciliation cron** (`vercel.json` → `crons`) then runs daily on Vercel Cron, calling `/api/cron/reconcile` with `CRON_SECRET` to detect incoming payments. (Hobby plan allows daily crons only; users also trigger reconciliation implicitly by opening the app — every balance fetch reconciles the ledger.)

> **Hobby-plan note:** serverless functions on the free plan have a 60s execution cap (10s for the first cold start response). `NIBSS_TIMEOUT_MS` default (20s) fits comfortably. Vercel Fluid Compute, now the default, keeps a warm instance between invocations.

### 15.3 How strangers create accounts on your public URL

The NibssByPhoenix sandbox only accepts identities that were first **inserted** into its identity store (like a real registry). For a public demo, the KYC screen ships a "Use a test identity" helper (visible when `VITE_ADMIN_KEY` is set) that inserts a synthetic identity into the sandbox, then pre-fills the BVN/NIN form. The visitor still completes the normal flow: register → verify identity → account created (₦15,000) → send/receive money. Because `DEV_ADMIN_KEY` guards the seeding endpoint server-side, only the helper's request (or your Postman calls) can insert identities — the endpoint is disabled entirely if the key is unset.

### 15.4 What does NOT change on Vercel

- Local dev keeps using `npm run dev` + the bundled Postgres (`npm run db:start`) — none of this affects the local flow.
- The in-process background poller only runs via `npm start`/`tsx server.ts` (long-lived Node), never inside the serverless function, so there are no duplicated reconciliations.
- All transfer-outcome alerts and balance refreshes are **awaited** before responses are returned, so nothing is lost to serverless request freezing.