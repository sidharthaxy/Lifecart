# LifeCart

**Tell LifeCart what's changing in your life. An AI agent plans the shopping from real store prices, you pay once with PayPal, and LifeCart watches prices and bills for you, messaging you on WhatsApp only when something needs you.**

Built for the PayPal AI Hackathon 2026. Everything runs against PayPal's **sandbox**, so no real money moves.

---

## Contents

1. [Features](#1-features)
2. [What's real today, and what's next](#2-whats-real-today-and-whats-next)
3. [How it works (user journey)](#3-how-it-works-user-journey)
4. [System architecture](#4-system-architecture)
5. [Agent design](#5-agent-design)
6. [Payment design](#6-payment-design)
7. [Security and guardrails](#7-security-and-guardrails)
8. [Data model](#8-data-model)
9. [Tech stack and sponsor tools](#9-tech-stack-and-sponsor-tools)
10. [Run it locally](#10-run-it-locally)
11. [Testing and dev tools](#11-testing-and-dev-tools)
12. [Project structure](#12-project-structure)
13. [Roadmap](#13-roadmap)
14. [License](#14-license)

---

## 1. Features

### Accounts
- **Passwordless sign-in.** Enter your email and get a 6-digit code. Existing accounts go straight in; new accounts answer a few welcome questions (name, monthly shopping budget, where to ship, alert preferences).
- **Profile and settings.** Everything you've shared in one place: monthly budget, "offer to pay in parts when I'm over budget", WhatsApp alert switches, connected accounts, sign out, and sign out on all devices.
- **Fresh start.** Every account starts empty, and you only ever see your own plans, bills and payments.

### AI planning
- **Describe a life change or upload a photo:** "I'm out 9 to 7 and getting a golden retriever puppy", "moving into my first studio".
- **Asks before it plans.** Zero to three tap-to-answer follow-up questions, and none at all for specific requests.
- **A complete, budgeted plan.** Every item comes with a reason, is matched to a real store listing (Channel3) and checked against **90-day price history**. Independent stores are flagged when their prices are close.
- **Plan workspace.** An AG Grid table grouped by category, with a budget slider, an item drawer with alternatives and price history, and a **Watch / Buy now** button on every row.
- **Coupon finder (only when you press it).** "Find coupons" searches the web for current promo codes and deals for the stores in your plan:
  - A **Kernel** cloud browser searches for each store and reads coupon sites, with one tab per store, running in parallel.
  - The AI pulls out the offers. Each offer is linked to the page it came from and labelled "found on the web, not tested".
  - About 25–50 seconds, and results are reused for 12 hours.
- **Remove anything, with a confirmation.** Every unpaid plan item has a delete icon. The pop-up offers **Move to price watch** as the gentler option.

### Checkout with PayPal
- **One checkout, the right PayPal payment type for each item:**
  - **Orders** for one-time goods.
  - **Subscriptions** for monthly refills.
  - **Invoices** for local services (dog walker, vet visit, assembly).
- **Pay in parts.** If the total is over your monthly budget, checkout points you to PayPal Pay in 4 and shows the split.
- **Never charged twice.** Bought items are marked at capture, and a backstop also excludes anything an earlier checkout already captured.

### Price watch
- Move any product to **price watch** with a target price. LifeCart checks the live price at that store.
- **How targets are set:**
  - **By the agent:** "can wait" items start about 15–25% below the typical price, re-anchored to 15% below the real store price once it's known.
  - **When you press Watch:** the 90-day low if it's meaningfully below today's price, otherwise 15% off.
  - **When a check finds a wrong target** (price already at or under it without a real drop): reset to 15% below today's price instead of sending a false alert.
- **Change it anytime:** click the target in the plan table, the item drawer or Orders & watch. The editor shows today's price and the 90-day low, with quick picks (90-day low, 10% off, 20% off). A target must be below today's price and at least $1.
- An alert needs a **real drop** (lower than last seen *and* at or below your target). All drops in a run go out as **one** WhatsApp message, with a link back to the app to buy with PayPal. LifeCart never buys on its own.

### Bills
- Rent, utilities, internet, phone top-ups and subscriptions in one place, with a due-date timeline.
- Pay one bill or "everything due this week" in a single PayPal payment.
- Insights: bills more than 15% above their average, and a cheaper phone plan that fits your usage (with yearly savings).
- **One** WhatsApp reminder for bills due within 3 days, at most once a day per bill.

### Money
- Lifetime **spent (after refunds)**, **saved**, **refunded** and **monthly recurring**, as stat tiles.
- Spend by type (plans, bills, price drops, refills, services).
- An **AG Grid ledger** of every payment, each one **re-checked live with PayPal** (refunds and amount mismatches are detected), with search and CSV export.
- A **Bryntum money calendar**: bills due, refill renewals, payments made and refunds.

### Orders and refills
- Live status of every refills subscription and service invoice from PayPal.
- Cancel refills from the app.

### Deleting things (always with an OK / Cancel pop-up)
| Where | What it does |
|---|---|
| Plan items | Removes the item; offers price watch instead. Items already paid for can't be deleted |
| Plans (plan page and Plans list) | Removes the plan, its items and price watches; expires its unpaid payment links. Blocked while the agent is still planning, or while its monthly refills are active (cancel them first, so PayPal stops charging) |
| Price watch (Orders & watch) | Stops watching by removing the item |
| Bills | Removes the bill and stops its reminders; expires unpaid payment links for it |
| Account (Profile) | Deletes the account and everything in it. Blocked while monthly refills are active |

Payments already made always stay on the Money page (until the account is deleted) and in PayPal.

---

## 2. What's real today, and what's next

| Real today (working end to end) | Not connected yet |
|---|---|
| The agent plans from **real product listings** and **real 90-day price history** (Channel3) | The order isn't placed with the retailer, so nothing ships |
| **Real PayPal sandbox payments**: orders captured, subscriptions approved and cancelled, invoices sent, refunds issued, each verified with PayPal | Payments go to **LifeCart's own sandbox merchant account**; they aren't passed on to the store or the biller |
| **Real WhatsApp messages** (Twilio sandbox) and **real email sign-in codes** | WhatsApp alerts go to one shared demo number, not each user's own phone |
| Live reconciliation of every payment against PayPal | PayPal webhooks (status is checked live on page view instead) |

**In production, money would reach the store in one of three ways** (see [Roadmap](#13-roadmap)):
- **Agent-ready retailers:** stores that accept orders from AI agents (for example through PayPal's agentic commerce services) get the cart and the PayPal payment directly.
- **Independent stores:** they join as PayPal sellers, and one PayPal approval pays each store directly.
- **Everyone else, such as Amazon:** a hand-off link to the retailer's own checkout.

---

## 3. How it works (user journey)

```
Sign in with an email code
   │
   ▼
"What's changing in your life?"  ──►  guardrails screen the request
   │
   ▼
0–3 follow-up questions  ──►  plan built from real listings + price history
   │
   ├── Buy now items ──► Checkout ──► one PayPal approval
   │                                   ├─ Order captured (one-time goods)
   │                                   ├─ Subscription approved (refills)
   │                                   └─ Invoices emailed by PayPal (services)
   │
   └── Watch items ──► daily price check ──► real drop? ──► ONE WhatsApp ──► back to the app ──► PayPal
Bills ──► daily due-date check ──► due in 3 days? ──► ONE WhatsApp ──► back to the app ──► PayPal
Money ──► every payment re-checked live with PayPal
```

WhatsApp is **only for outreach** (price drops, bills due, renewals). Every message links back to the app, and paying always happens on PayPal.

---

## 4. System architecture

```mermaid
flowchart LR
  subgraph Browser
    UI["Next.js pages<br/>AG Grid · Bryntum"]
  end

  subgraph Server["Next.js 16 server (App Router)"]
    Proxy["proxy.ts<br/>session-cookie gate"]
    Actions["Server Actions + API routes<br/>(auth check on every call)"]
    Auth["Auth<br/>email codes · DB sessions"]
    Guard["Guardrails<br/>6 layers"]
    Agent["Planning agent<br/>fixed pipeline"]
    Pay["Payments<br/>approval state machine"]
    Watch["Price watch · Bill reminders"]
    Coupons["Coupon finder<br/>on request"]
    Money["Money ledger<br/>live reconciliation"]
    Usage["Usage caps · timeouts<br/>rate limits"]
  end

  DB[("Postgres<br/>PGlite locally")]
  Groq["Groq<br/>gpt-oss-120b · gpt-oss-20b<br/>Qwen vision · Prompt Guard"]
  C3["Channel3<br/>products · price history"]
  PP["PayPal sandbox<br/>Agent Toolkit + REST"]
  TW["Twilio<br/>WhatsApp"]
  KB["Kernel<br/>cloud browser"]
  GM["Gmail SMTP<br/>sign-in codes"]
  Cron["Scheduler<br/>POST /api/cron/daily"]

  UI --> Proxy --> Actions
  Actions --> Auth & Guard & Agent & Pay & Watch & Money & Coupons
  Guard --> Groq
  Agent --> Groq & C3
  Coupons --> KB & Groq
  Pay --> PP
  Money --> PP
  Watch --> C3 & TW
  Pay --> TW
  Auth --> GM
  Cron --> Watch
  Auth & Agent & Pay & Watch & Money --> DB
  Agent & Pay & Watch & Money -.-> Usage
```

| Component | Responsibility | Code |
|---|---|---|
| **Proxy** | Optimistic redirect: app pages need a session cookie. Payment links stay public (they're single-use tokens) | `src/proxy.ts` |
| **Auth** | Email one-time codes, database sessions, `requireUser()` / `actionUser()` | `src/lib/auth/` |
| **Guardrails** | Screen every request before the agent sees it | `src/lib/guard/` |
| **Planning agent** | Questions, plan, offer matching, price history | `src/lib/agent/` |
| **Payments** | Orders, subscriptions, invoices, refunds through the PayPal Agent Toolkit; the approval state machine | `src/lib/paypal.ts`, `src/lib/approvals.ts` |
| **Price watch** | Live price per store, real-drop detection, one digest per run | `src/lib/watch.ts` |
| **Coupon finder** | On request only: web search per store in a Kernel browser, offer extraction, 12-hour cache | `src/lib/coupons.ts` |
| **Bills** | Bills hub, insights, due-date digest | `src/lib/bills.ts` |
| **Money** | Ledger reconciled live with PayPal, 5-minute per-user cache | `src/lib/money.ts` |
| **Daily job** | Price watch, then bill reminders, per user, single-flight, at least 1 hour apart | `src/lib/cron.ts`, `src/app/api/cron/daily` |
| **Usage** | Daily caps per provider, Groq rate-limit gate, timeouts | `src/lib/usage.ts`, `src/lib/ai.ts` |

**Rendering.** Pages use Cache Components: the static shell renders instantly, and anything that reads your session or data streams in behind `<Suspense>`. The AI never runs in the browser, and no API key reaches the client.

---

## 5. Agent design

The planner is a **fixed pipeline, not an open-ended loop**, so it can't run forever or burn through API quota.

| Step | What happens | Calls |
|---|---|---|
| 0 | Clarifying questions (0–3, tap-to-answer; skipped for specific requests) | 1 Groq |
| 1 | Photo description (cached on the plan) | ≤1 Groq vision |
| 2 | Draft the plan from your situation and answers (1–3 items for specific asks, 9–12 for life changes) | 1 Groq |
| 3 | Search store offers per product | N Channel3 |
| 4 | Match offers (same-kind check, price sanity band 0.33×–3×), one broader retry for unmatched items | 1–2 Groq, ≤N Channel3 |
| 5 | 90-day price history for the chosen offers | ≤N Channel3 |

**Models (Groq):**
- `openai/gpt-oss-120b`: planning, questions, offer matching.
- `qwen/qwen3.8-27b`: photos.
- `openai/gpt-oss-20b`: the scope and safety policy.
- `meta-llama/llama-prompt-guard-2-86m`: prompt-injection scoring.

**Reliability:**
- **Deadlines and timeouts.** Each run has a 3-minute deadline, and every external call has its own timeout (Groq 25–45 s, Channel3 12–18 s).
- **Single-flight.** A plan is claimed atomically (`draft → running`), so a second tab follows the first run instead of starting another.
- **Crash recovery.** A run stuck past its deadline is reclaimed.
- **Degrades instead of failing.** Over the search budget, items get price estimates. Over the AI budget, planning pauses with a clear message.

---

## 6. Payment design

**The AI never moves money.** It has no payment tool at all. Every payment is server code calling the PayPal Agent Toolkit (and PayPal's REST API through the toolkit's client) after the user approves on PayPal.

| Need | PayPal API |
|---|---|
| One-time goods, bills, price-drop buys | **Orders v2** with `PAY_NOW`, captured server-side |
| Monthly refills | **Subscriptions** (product → plan → subscription) |
| Local services | **Invoicing v2** (create → send; PayPal emails the invoice) |
| Refunds | **Refunds** (create, then verify) |
| Reconciliation | **Capture details** and **subscription billing info** |

**The approval state machine.** Checkout freezes the amounts into a single-use approval and walks it through these steps:

```
order ─► capturing ─► subscription ─► confirming ─► invoices ─► invoicing ─► done
                                                                    └──► review (any mismatch)
```

- Each step is **claimed atomically**, so a double click or a page reload can't run it twice.
- The order is created with a **`PayPal-Request-Id` idempotency key**. Retries reuse an order that's already approved or completed instead of creating a new one.
- A capture only counts if PayPal reports **COMPLETED for the exact approved amount**. Anything else stops at `review`.
- Items are **marked as bought the moment the order is captured**, so abandoning a later step can't lead to a second charge.
- Approval tokens are random, **stored only as SHA-256 hashes**, and expire: 30 minutes for checkout, 6 hours for links in WhatsApp messages.
- Returning from PayPal is verified: the PayPal token or subscription id must match the one stored for that approval.

---

## 7. Security and guardrails

### Authentication and sessions
- **Passwordless email codes.** 6 digits from a cryptographic random source, stored as an **HMAC** (never in plain text). Each code is single use (claimed atomically), expires in **10 minutes**, allows **5 wrong tries**, and replaces any older code.
- **Rate limits.** 5 codes per email per hour, 15 per client per hour, 30 verification attempts per client per hour.
- **Database sessions.** The cookie holds a random 32-byte token, and only its SHA-256 is stored, so sessions can be revoked ("Sign out on all devices"). Cookies are `httpOnly`, `SameSite=Lax`, `Secure` in production, and last 30 days.

### Authorization and data isolation
- Every page, Server Action and API route checks the session **on the server**. The proxy redirect is only a convenience.
- **Every data function takes a `userId` and filters by it:** plans, items, offers, bills, approvals, refills, watch list and the money ledger. Changing a plan item first checks the item belongs to one of *your* plans.
- Opening another account's plan returns **not found**, not "forbidden", so ids can't be probed.
- The money page shows **only your own payments**. The merchant-wide PayPal transaction report is never shown to users.
- Tested by `scripts/isolation-test.mts`: 13 of 13 cross-account checks pass.

### AI guardrails (6 layers)
Every piece of user text (requests, answers, photo descriptions) and third-party text (store listings) is treated as untrusted.

| Layer | What it does | Code |
|---|---|---|
| 1. Hygiene | Strips control, zero-width and bidi characters; blocks fence markers; enforces length caps; clamps the budget; strictly checks photo data URLs; rate limits (12 new plans per hour per user) | `guard/sanitize.ts`, `guard/ratelimit.ts` |
| 2. Injection classifier | **Llama Prompt Guard 2**: a score of 0.85 or more is blocked | `guard/check.ts` |
| 3. Scope and safety policy | **gpt-oss-20b** applies a written policy: allow / out of scope / prohibited / manipulation, with a self-harm response that gives the 988 crisis line. **Fails closed.** "Write me a bedtime story" is politely declined | `guard/policy.ts` |
| 4. Prompt fencing | Untrusted text goes inside randomly tagged data blocks, and the system prompts say never to follow instructions inside them | `agent/planner.ts` |
| 5. Output checks | Zod schemas bound item counts and prices; a prohibited-item filter catches anything that slips through; the model never produces URLs or payment actions. Coupon pages from the web are fenced the same way; a code is kept only if it appears verbatim on its source page, and source links come from our own list, never the model | `agent/schemas.ts`, `agent/run.ts` |
| 6. Architecture | The AI has **no tool that moves money**; payments need the user's approval on PayPal | `lib/approvals.ts` |

Tested by `scripts/guard-test.mts` (15 of 15 passing, run as signed-in users).

### Payments
- Amounts are **frozen on the server** when you start checkout; the browser never sends a price.
- Idempotency keys, atomic step claims, exact-amount verification and the double-charge backstop are described in [Payment design](#6-payment-design).

### Messaging (no spam)
- At most **one** price-drop message and **one** bill message per user per run, with at most 3 items in a price-drop message.
- Per-item cooldowns: 24 hours for price alerts and for bill reminders.
- The daily job is single-flight and runs **at most once an hour**, even if a scheduler misfires.
- Users can turn each kind of alert off in their profile.

### Scheduled endpoint
- `POST /api/cron/daily` requires `Authorization: Bearer $APPROVAL_SECRET`, compared in **constant time**.

### API budgets and abuse limits
- **Daily caps** per provider, stored in the database and shown on `/setup`:

  | Provider | Daily cap |
  |---|---|
  | Groq | 800 requests |
  | Channel3 | 2,500 credits |
  | Twilio | 100 messages |
  | PayPal | 2,000 calls |
  | Kernel | 60 sessions |

- A Groq **rate-limit gate** reads the `x-ratelimit-*` headers and waits rather than hitting 429 errors.
- Live PayPal lookups are capped per page view (8 on Orders, 30 on Money) and cached for 5 minutes on Money.
- Per-user rate limits on payments, price checks, refreshes, bill changes and coupon searches (5 per hour, one Kernel session each).

### Secrets
- All keys live in `.env.local` (gitignored) or the host's environment. Nothing secret is sent to the browser.
- PayPal credentials stay on the server. Users log in to PayPal themselves, and LifeCart never sees their PayPal password or card.

---

## 8. Data model

| Table | Holds |
|---|---|
| `users` | email (verified), name, monthly budget, ship-to, preferences (pay in parts, alerts, demo tools), onboarding time |
| `auth_codes` | hashed one-time codes, expiry, attempts |
| `sessions` | hashed session tokens, expiry |
| `goals` | a plan: prompt, photo note, questions and answers, title, summary, status (`draft / running / ready / blocked`), agent steps |
| `plan_items` | item, reason, category, kind (product or service), cadence, quantity, payment type (order / subscription / invoice / watch), target price, purchased at |
| `offers` | store listings per item: merchant, price, was-price, availability, 90-day stats, rank, independent-store flag |
| `price_snapshots` | live prices seen by price watch |
| `bills` | payee, amount, average, due date, autopay mode, plan options, last reminded, paid at |
| `approvals` | a frozen payment: kind (cart / bill / watch), lines, totals, hashed token, current step, PayPal ids, result |
| `payments` | per-type PayPal records (subscription and invoice ids, status) |
| `api_usage` | calls and units per provider per day, plus the provider's own reported limits |

Drizzle ORM. **PGlite** (embedded Postgres) locally, and any Postgres through `DATABASE_URL` in production.

---

## 9. Tech stack and sponsor tools

| Area | Choice |
|---|---|
| App | **Next.js 16** (App Router, Server Actions, Cache Components, Turbopack), TypeScript, React 19 |
| UI | Tailwind CSS v4, shadcn/ui, lucide icons |
| Data grid | **AG Grid Community**: the plan table and the money ledger |
| Calendar | **Bryntum Calendar** (trial): the money calendar |
| Database | Drizzle ORM, PGlite (local) or Postgres |
| AI | Vercel AI SDK with **Groq** (gpt-oss-120b, gpt-oss-20b, Qwen vision, Llama Prompt Guard 2) |
| Payments | **PayPal Agent Toolkit** + PayPal REST (sandbox) |
| Products | **Channel3**: product search, offers, 90-day price history, live prices |
| Coupons | **Kernel** cloud browser (Playwright) for web search and coupon pages |
| Messaging | **Twilio** WhatsApp sandbox; Gmail SMTP for sign-in codes |
| Hosting | **Render** (web service, Postgres, cron job) |

---

## 10. Run it locally

```bash
npm install
cp .env.example .env.local   # paste your keys; every variable has a comment saying where to get it
npm run db:push              # create the tables (embedded Postgres in ./.data by default)
npm run dev                  # http://localhost:3000
```

- **Sign in without email set up:** if `GMAIL_USER` / `GMAIL_APP_PASSWORD` are empty, the sign-in code is printed in the `npm run dev` terminal (development only).
- **Integration status and API usage:** open `/setup` while signed in.
- **Demo tools** (sample bills, "send reminder now", "simulate a price drop"): turn them on in **Profile → Demo tools**.
- **Open WhatsApp links on your phone:** `npm run tunnel` prints a public HTTPS URL. Put it in `APP_URL`.

**Environment variables** (see `.env.example`):
- `APP_URL`, `APPROVAL_SECRET`
- `GROQ_API_KEY`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `NEXT_PUBLIC_PAYPAL_CLIENT_ID`
- `CHANNEL3_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `DEMO_WHATSAPP_TO`
- `GMAIL_USER`, `GMAIL_APP_PASSWORD`
- `DATABASE_URL` (blank means local PGlite)

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (first copies Bryntum's files into `public/vendor`) |
| `npm run build` / `start` | Production build and server |
| `npm run db:push` | Sync the schema to the database |
| `npm run db:studio` | Browse the database |
| `npm run tunnel` | Public HTTPS tunnel to localhost:3000 |
| `npm run lint` / `typecheck` | Lint and type-check |

**Daily job:** schedule `curl -X POST $APP_URL/api/cron/daily -H "Authorization: Bearer $APPROVAL_SECRET"` once a day.

---

## 11. Testing and dev tools

All in `scripts/`, run with `npx tsx --env-file=.env.local scripts/<name>`. There are two kinds:
- **Browser tests** need the dev server running. They sign in throwaway `@example.com` accounts through the real sign-in page. Addresses on reserved test domains are never emailed; in development their code is printed in the dev server log, so these scripts take that log file as an argument.
- **Database scripts** need `npm run dev` **stopped** first, because PGlite allows one process at a time.

| Script | What it checks |
|---|---|
| `guard-test.mts <devLog>` | Guardrails: 12 allowed and blocked requests, an injected answer, a normal answer, and the per-user rate limit (15 of 15 passing) |
| `auth-test.mts <devLog> <outDir>` | Sign up, wrong code, welcome questions, profile, empty fresh pages, a second account, sign out, returning user |
| `isolation-test.mts` | 13 cross-account checks: nobody can read or change another account's data (database script) |
| `e2e-paypal.mts <planId> <outDir> --email … --log <devLog>` | Full PayPal sandbox checkout in a real browser: order, subscription, invoices, receipt, optional cancel |
| `mail-check.mts` | Gmail SMTP login (sends nothing) |
| `wipe-data.mts` | Fresh start: deletes all user data (dry run by default) |
| `delete-plan.mts` | Deletes one plan but keeps its payment records |
| `refund-duplicates.mts` | Finds and refunds duplicate sandbox captures (dry run by default) |
| `features-test.mts <devLog> <outDir>` | Builds a real plan, runs Find coupons, then every delete flow (item, move to watch, stop watching, bill, plan, account) |
| `coupon-test.mts <devLog> <outDir>` | Presses Find coupons on a reusable test plan and prints what was found |
| `coupon-probe.mts <domain>` | One Kernel session: raw web search + coupon pages for a store |
| `clear-coupon-cache.mts` | Forgets cached coupon searches (database script) |
| `dev-watchdog.sh`, `mem-guard.sh` | Run the dev server with a memory cap |
| `page-shot.mts`, `signed-in-shot.mts` | Screenshots at desktop and phone width |

---

## 12. Project structure

```
src/
  app/                    pages, Server Actions, API routes
    page.tsx              sign-in landing (signed out) / home (signed in)
    welcome/  profile/    onboarding questions, profile and settings
    plans/[id]/           plan workspace and checkout
    approve/[token]/      single-use payment link → PayPal → receipt
    bills/  orders/  money/
    api/cron/daily/       scheduled price watch + bill reminders
    actions.ts            app actions (all check the signed-in user)
    auth-actions.ts       sign-in, sign-out, profile
  components/             UI (plan grid, checkout, money ledger and calendar, auth)
  lib/
    agent/                planning pipeline, prompts, schemas
    guard/                guardrail layers
    auth/                 codes, sessions, email
    paypal.ts             every PayPal call (the AI never calls these)
    approvals.ts          approval state machine
    watch.ts  bills.ts  money.ts  cron.ts  usage.ts
  db/schema.ts            tables
  proxy.ts                session-cookie redirect
scripts/                  test and dev tools
```

---

## 13. Roadmap

1. **Pay the store, not LifeCart.** Use agent checkout with retailers that support it (PayPal agentic commerce, agent-ready Shopify stores), PayPal multiparty payments so one approval pays each independent store, and a hand-off link for retailers like Amazon.
2. **Pay the biller.** Forward bill payments with PayPal Payouts to the biller's PayPal account, or through a bill-pay network.
3. **Each user's own WhatsApp number**, verified with a code, instead of the shared demo line.
4. **PayPal webhooks** for capture, refund and subscription events, instead of checking live on page view.
5. **Rules for small refills**, such as "auto-approve refills under $40", within limits you set.
6. **Test and apply coupon codes automatically** when the order is placed with the store (most coupon sites hide full codes behind a click, so today LifeCart links to them).

---

## 14. License

MIT. See [LICENSE](LICENSE).
