# LifeCart: plan

> Working name. A life-aware shopping and bills agent that runs on PayPal.
> PayPal AI Hackathon 2026. Submissions close **Nov 12, 2026**. Winners announced Dec 21.

---

## 1. The pitch (one line)

Tell LifeCart about your life ("I work 9 to 7 and want a golden retriever") or show it a photo. It builds a complete, budgeted plan with real prices, price history and coupons. It then pays for everything through the right PayPal rail. Before any money moves, it asks you on WhatsApp first.

## 2. Why this fits what PayPal is betting on

| PayPal investment | How LifeCart uses it |
|---|---|
| **Agentic commerce** (life context in, full multi-item journey out) | The core product: one sentence becomes a whole cart plus recurring plans |
| **Agent Toolkit + remote MCP server** (orders, subscriptions, invoices, tracking, catalog) | The agent's tools are the toolkit. It creates real sandbox Orders, Subscriptions and Invoices |
| **Trust / anti-fraud / human in the loop** | Every payment needs explicit approval through WhatsApp, then PayPal Checkout. No silent spending |
| **Post-purchase** (tracking, returns) | An orders timeline built on the Shipment Tracking API |
| **SMB discoverability** | A "Verified small business" badge, with SMB merchants ranked up when prices are close |

Prizes we target: **Best Use of Agentic Commerce**, **Best Use of PayPal + AI**, Best Overall, plus sponsor prizes from **AG Grid** (budget grid), **Channel3** (product data) and **Render** (hosting). We also use **Kernel** (cloud browser for coupons) even though it has no listed prize.

## 3. Core user flows

### A. Life-goal planning (hero demo)
1. The user types a goal or uploads a photo (for example a picture of a dog crate, or a friend's living room).
2. The **Planner agent** asks 1 or 2 clarifying questions if needed (apartment or house? budget ceiling?).
3. It outputs a structured plan:
   - **Categories**: Essentials, Health, Comfort/Enrichment, Services, Recurring
   - For each item: why it's needed (tied to the user's context, e.g. "you're away 10h, so an auto-feeder and a pet camera"), quantity, priority (*buy now* / *can wait*), and payment type (*one-time* / *recurring* / *service*)
4. For each item, the **Sourcing agent** finds 2–4 offers (merchant, price, shipping, SMB flag) and attaches **price history** and **coupons**.
5. The **budget view** (AG Grid) shows the total for now, monthly recurring, and potential savings. The user can swap offers, remove items, or set a budget cap so the agent re-optimizes.
6. **Checkout split** by the agent:
   - One-time goods → **PayPal Orders** (one checkout per merchant, or a consolidated demo merchant)
   - Recurring (kibble, flea meds) → **PayPal Subscriptions** (product → plan → subscription)
   - Services (dog walker, sitter) → **PayPal Invoices**
   - "Can wait" items → **Price Watch** with a target price

### B. Bills and utilities hub
- Rent, electricity, water, internet, phone recharge/top-up, streaming subscriptions.
- Each biller has an amount, a due date, autopay preference and history.
- Agent help: "Your electricity bill is 30% higher than your 3-month average." "The phone plan you're on costs $X more than a comparable plan."
- **Rails**: rent is paid to the landlord's PayPal through an Order to a payee, or via an invoice the landlord sends. Utilities and recharge use **simulated billers** (sandbox merchants), because there's no public biller-network API. The PayPal payment itself is real (sandbox). We say this openly in the demo.

### C. WhatsApp approval (the "Amazon sale" moment)
Each pending payment (a cart checkout, a bill coming due, a price-watch hit, a subscription renewal) creates an **Approval**:
1. The backend sends a WhatsApp message with item, amount, why now, savings, and a **[Review & Pay]** button.
2. The button deep-links to `/approve/{token}` (signed, single-use, expires in 30 min).
3. That page shows the summary and the **PayPal Checkout button**. The user approves in PayPal and we capture the payment.
4. A WhatsApp confirmation follows with a receipt and a tracking link when available.
- SMS fallback (Twilio) if WhatsApp isn't connected.

### D. Price watch → approval
A cron job re-checks watched items. When price ≤ target, or when a coupon makes the effective price ≤ target, it creates an approval and sends it on WhatsApp. It **never auto-captures** without the user's tap. That's our trust story.

### E. Orders and tracking
A timeline of everything bought, with status, tracking numbers via the PayPal Tracking API, and subscription management (pause/cancel).

## 4. Architecture

```
            ┌──────────────── Next.js app (Render) ────────────────┐
 User ───▶  │ UI: Plan chat · Budget grid (AG Grid) · Bills · Watch │
 (web)      │      · Approvals · Orders                             │
            │                                                       │
            │ API routes / server actions                           │
            │   └─ Agent orchestrator (Claude, tool use)            │
            │        tools:                                         │
            │         • plan_needs        (Claude reasoning/vision) │
            │         • search_products   → Channel3 API            │
            │         • get_price_history → our Postgres snapshots  │
            │         • find_coupons      → Kernel cloud browser    │
            │         • create_order / create_subscription /        │
            │           create_invoice / add_tracking               │
            │                             → PayPal Agent Toolkit    │
            │         • request_approval  → WhatsApp Cloud API      │
            │         • add_price_watch   → DB + cron               │
            └───────────────────────────────────────────────────────┘
                  │                  │                    │
             Postgres          PayPal Sandbox        WhatsApp / Twilio
          (users, plans,     (Orders, Subs,         (CTA-URL button
           offers, price      Invoices, Tracking,    messages, webhooks)
           snapshots, bills,  Webhooks)
           approvals)
```

**Models (Groq free tier, via the Vercel AI SDK `@ai-sdk/groq` provider)**:
- `openai/gpt-oss-120b`: the main agent (planning, tool calls, checkout split, structured plan JSON)
- `qwen/qwen3.8-27b`: photo input (vision + tool use, up to 3 images per request, ≤20 MB each)
- `llama-3.1-8b-instant`: cheap, high-volume jobs (coupon page extraction, bill parsing, WhatsApp copy)

The provider sits behind one `lib/ai.ts` file chosen by `AI_PROVIDER`, so we can switch to another provider (e.g. Anthropic) if limits bite. Free-tier limits are per organization. For gpt-oss-120b that's about 30 req/min and 200K tokens/day, so we cache plans, keep tool outputs short, and use mock mode for UI work. The PayPal Agent Toolkit supports the Vercel AI SDK directly.

**Price history**: no free, broad price-history API exists. We build our own: every offer we see is snapshotted into `price_snapshots`, and a daily job re-prices watched items. For the demo, we seed about 90 days of history for the hero items and **label it as seeded**.

**Coupons**: Kernel browser visits the merchant page and checkout-adjacent coupon sources. Haiku extracts codes and terms. We show "verified / unverified" and never claim a code works unless the merchant page confirmed it.

## 5. Tech stack

- **Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui**
- **AG Grid Community** for the budget/cart table (sponsor prize)
- **Postgres** (Render) + Prisma
- **Vercel AI SDK + Groq** (tool use, structured output, vision). Free tier.
- **@paypal/agent-toolkit** + **PayPal JS SDK** (Checkout buttons) in **sandbox**
- **WhatsApp Cloud API** (Meta) for interactive CTA-URL buttons, with **Twilio** as fallback for SMS
- **Channel3** (products), **Kernel** (browser)
- Deploy on **Render**; public GitHub repo with an **MIT license**

## 6. Data model (first pass)

- `User` (id, name, phone, whatsapp_opt_in, paypal_payer_id?)
- `Goal` (id, user_id, prompt, image_url?, status)
- `PlanItem` (id, goal_id, name, category, reason, qty, priority, pay_type: one_time|recurring|service, chosen_offer_id)
- `Offer` (id, plan_item_id, merchant, url, price, currency, shipping, is_smb, coupon_id?)
- `PriceSnapshot` (offer_key, price, captured_at, source: live|seeded)
- `Coupon` (id, merchant, code, terms, verified, found_at)
- `Bill` (id, user_id, type: rent|electricity|water|internet|phone|subscription, payee, amount, due_date, autopay_mode)
- `Watch` (id, plan_item_id, target_price, status)
- `Approval` (id, user_id, kind: cart|bill|watch|renewal, amount, payload, token, expires_at, status, paypal_ref)
- `Payment` (id, approval_id, rail: order|subscription|invoice, paypal_id, status, tracking?)

## 7. Screens to design (before coding)

**Design canvas:** https://claude.ai/artifact/K4eE5CfTLYe299oApSNPWw (8 artboards: Main, Plan, Checkout, Item, Chat, Approve, Bills, Orders)

Design tokens: ground `#F6F7F9`, surface `#FFFFFF`, ink `#0E1726`, muted `#4A5468`, border `#E3E7EE`, accent `#1F3FB0` (soft `#EEF2FF`), success `#0F7A4A`, warning `#7A4A00` on `#FFF4E0`, SMB teal `#0B6770` on `#E6F3F4`, subscription purple `#5B2DB0`. Fonts: Plus Jakarta Sans (display), Inter (body). Radii: 10 for controls, 16 for cards. Lane colors: Orders blue, Subscriptions purple, Invoices teal, Watch amber.

1. **Landing / hero**: one input ("Tell me what's changing in your life…") + photo drop, with example chips
2. **Agent planning view**: streaming reasoning steps ("Checking price history for crates…"), then the plan
3. **Plan and budget**: categorized cards + AG Grid budget table, totals bar (now / monthly / saved), budget-cap slider, "split checkout" summary
4. **Item detail drawer**: offers comparison, price-history sparkline/chart, coupons, SMB badge, "watch this"
5. **Checkout split review**: three lanes (Orders / Subscriptions / Invoices) → "Send for approval"
6. **WhatsApp message mock** (phone frame, for the demo video) + **Approval page** `/approve/:token` with the PayPal button
7. **Bills hub**: upcoming bills, due-date calendar strip, recharge flow, agent insights
8. **Price watch**: watched items, target vs current, history
9. **Orders and tracking**: timeline, subscriptions management
10. Mobile layouts for the approval page and bills (the WhatsApp link opens on phones)

## 8. Timeline (today is Nov 4 → deadline Nov 12)

| Day | Work |
|---|---|
| Nov 4 | Plan ✅ · answer open questions · design system + key screens |
| Nov 5 | Scaffold repo (public + MIT), PayPal sandbox Order end-to-end, deploy skeleton to Render (*verify on Devpost whether there's an early eligibility check*) |
| Nov 6 | Planner agent (text + vision) → structured plan; Channel3 sourcing |
| Nov 7 | Budget grid, item drawer, price history (snapshots + seed), coupons via Kernel |
| Nov 8 | Checkout split: Orders + Subscriptions + Invoices via Agent Toolkit |
| Nov 9 | WhatsApp approvals + approval page + webhooks; price watch cron |
| Nov 10 | Bills hub + recharge + rent; orders/tracking timeline |
| Nov 11 | Polish, seed demo data, record a <3 min video, write the README |
| Nov 12 | Buffer → submit |

## 9. Demo video script (<3 min)

1. (0:00) Problem: "I work 9–7, I want a golden retriever. Where do I even start?"
2. (0:20) Type it → the agent reasons → a full plan appears, with the auto-feeder, camera and dog-walker justified by the schedule
3. (0:50) Budget grid: set a cap of $600, the agent re-optimizes, coupons apply, an SMB store is chosen
4. (1:20) Checkout split: 3 orders, 1 subscription (kibble), 1 invoice (walker) → WhatsApp ping on a real phone → tap → PayPal sandbox approve → captured
5. (2:00) Bills: rent due tomorrow → WhatsApp → paid. Price watch: bed dropped 18%, approve in one tap
6. (2:30) Orders timeline with tracking. Close on "life in, everything handled, you stay in control"

## 10. Risks and mitigations

- **WhatsApp template approval**: interactive CTA-URL messages are free-form within a 24h session after the user messages us. The demo user opts in by messaging the bot first. Twilio SMS is the fallback.
- **Channel3 / Kernel limits**: cache results; ship a seeded catalog for the hero scenario so the demo never breaks.
- **Bill-pay realism**: the billers are simulated and we say so. The PayPal payment flow is real sandbox.
- **Scope**: the hero flow (A + C) is the must-have. Bills (B) is next. Watch (D) and tracking (E) can be thinner if time runs short.

## 11. Decisions (Nov 4)

- **Market**: US, USD. The persona is a US renter. Bills: rent, electricity, internet, prepaid phone top-up.
- **WhatsApp**: Meta WhatsApp Cloud API (test number, interactive CTA-URL button). Twilio SMS as fallback.
- **Visual direction**: calm fintech. Light and airy, one confident deep-blue accent (not PayPal's brand blue), soft cards.

## 12. Accounts and keys to get

| # | What | Where | What to copy into `.env.local` |
|---|---|---|---|
| 1 | **PayPal sandbox app** | developer.paypal.com → Log in → Apps & Credentials → *Sandbox* → Create App | `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`. Also note the auto-created sandbox **personal** (buyer) and **business** (merchant) accounts under Testing Tools → Sandbox Accounts |
| 2 | **Groq API key** (free) | console.groq.com → sign in → API Keys → Create. Check your limits under Settings → Limits | `GROQ_API_KEY` |
| 3 | **Meta WhatsApp Cloud API** | developers.facebook.com → My Apps → Create App (type *Business*) → add **WhatsApp** product → API Setup. Add your phone as a test recipient | `WHATSAPP_TOKEN` (temporary token for now, a system-user token later), `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (any string you choose, for the webhook) |
| 4 | **Channel3** (products) | channel3.com → sign up / hackathon sponsor link on Devpost | `CHANNEL3_API_KEY` |
| 5 | **Kernel** (cloud browser) | onkernel.com → sign up / hackathon sponsor credits | `KERNEL_API_KEY` |
| 6 | **Render** (hosting + Postgres) | render.com → sign up with GitHub → New Postgres (free) | `DATABASE_URL` |
| 7 | **GitHub repo** | github.com → new **public** repo with an **MIT** license | — |
| 8 | (Optional) **Twilio** for SMS fallback | twilio.com → trial account | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` |

Until keys arrive, the app runs in **mock mode** (seeded products, a fake WhatsApp phone frame, SQLite). Each integration switches to live as soon as its key is present.
