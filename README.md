# LifeCart

**Tell us what's changing in your life. LifeCart plans the shopping and handles the bills, pays through PayPal, and asks you on WhatsApp before any money moves.**

Built for the PayPal AI Hackathon 2026.

- Describe a life change ("I work 9 to 7 and want a golden retriever") or upload a photo.
- An AI agent builds a full, budgeted plan. Every item is explained, compared across stores, checked against price history, and tested with coupons.
- Checkout is split across the right PayPal rails: **Orders** (one-time goods), **Subscriptions** (refills) and **Invoices** (local services). Items worth waiting for go on **price watch**.
- Rent, utilities and phone top-ups live in the same place.
- Every payment needs your tap first: a WhatsApp message with a **Review & Pay** button opens the approval page and PayPal Checkout.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · AG Grid · Drizzle ORM on Postgres (embedded PGlite locally) · Vercel AI SDK + Groq · PayPal Agent Toolkit + JS SDK (sandbox) · WhatsApp Cloud API · Channel3 · Kernel · Render

## Run it locally

```bash
npm install
cp .env.example .env.local   # then paste your keys; see the comments in the file
npm run db:push              # creates the tables (local embedded Postgres by default)
npm run dev                  # http://localhost:3000
```

Open **http://localhost:3000/setup** to see which integrations are live. Any integration without a key runs in **mock mode** with demo data, so the app works end to end before every key is in place.

To open WhatsApp links on your phone while developing:

```bash
npm run tunnel               # prints a public https URL; put it in APP_URL
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `start` | Production build and server |
| `npm run db:push` | Sync the schema to the database |
| `npm run db:studio` | Browse the database in the browser |
| `npm run tunnel` | Public HTTPS tunnel to localhost:3000 (Cloudflare) |
| `npm run lint` / `typecheck` | Lint and type-check |

## For coding agents

`.mcp.json` registers two MCP servers:
- `next-devtools`: Next.js runtime errors, routes and logs from the running dev server.
- `paypal-sandbox`: PayPal's MCP server, which fetches a fresh sandbox token from `.env.local`.

See `plan.md` for the product plan and `AGENTS.md` for framework notes.

## License

MIT. See [LICENSE](LICENSE).
