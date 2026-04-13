# CapitaCoreAI Site

## Project
- AI agent SaaS marketplace — users buy credits to use AI-powered tools
- Static HTML/JS site deployed on Vercel (no frameworks, no build step)
- Serverless API functions in `/api/`
- Domain: capitacoreai.io

## Tech Stack
- **Frontend:** Vanilla HTML/CSS/JS (ES6), no transpilation
- **Auth & DB:** Supabase (Postgres + Auth + RLS)
- **Payments:** Stripe (checkout sessions + HMAC-verified webhooks)
- **AI:** Anthropic Claude API (Haiku for extraction, Sonnet for generation)
- **Hosting:** Vercel Pro (auto-deploy on push to `main`)
- **CDN libs:** ApexCharts, Leaflet.js, Lucide icons, Supabase SDK

## AI Agents
1. **DashPilot** — AI dashboard builder (api/dashpilot-generate.js, 1 credit/gen)
2. **VoyagePilot** — AI travel planner with real flight/hotel data via SerpAPI (api/voyagepilot-generate.js, 1 credit/trip)
3. **NokoPilot** — Cisco Meraki network ops assistant (api/nokopilot-chat.js, 1 credit/5 msgs)

## Architecture
```
Frontend (HTML/JS) → POST /api/<agent>.js → Claude API → structured response
Auth: Supabase Bearer token verified server-side on every request
Credits: Atomic deduction via Postgres FOR UPDATE lock (deduct_token RPC)
Payments: Stripe checkout → webhook → idempotent credit_tokens RPC
```

## Theme & Design
- Japanese minimalist: backgrounds #0a0a0a / #111111, white text, gray accents
- Font: Inter (Google Fonts)
- Glass-morphism cards, clean whitespace, subtle animations
- DNA helix canvas animation on homepage

## Security Rules (CRITICAL)
- ALL sensitive keys in Vercel env vars only — never in client code
- Stripe webhooks: HMAC-SHA256 signature + timestamp verification mandatory
- Token deduction: atomic Postgres locks (prevent race conditions)
- Supabase RLS: users can only access their own data
- Meraki API keys: user-provided per-session, never stored
- CORS is currently `*` — tighten to capitacoreai.io for production
- Add security headers (CSP, X-Frame-Options, X-Content-Type-Options) via vercel.json

## Database (Supabase Postgres)
- **profiles:** id, email, first_name, username, token_balance, is_admin
- **transactions:** stripe_session_id (unique, idempotency), package, tokens_purchased, amount_cents
- **usage_log:** tracks token deductions per user
- **trips:** user_id + trip_data (JSONB) for VoyagePilot
- **RPC functions:** deduct_token(), credit_tokens(), handle_new_user() trigger, check_username_available()

## Environment Variables (Vercel)
- ANTHROPIC_API_KEY
- SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY
- STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
- SERPAPI_KEY

## Git & Deploy
- GitHub: MrRobot0104/capitacoreai-site
- Push to `main` → Vercel auto-deploys (no build step)
- Commit with descriptive messages
- Function config in vercel.json (memory/timeout per function)

## When Building New Features
- Validate ALL user input server-side before processing
- Check auth token on every API endpoint
- Deduct credits atomically — never deduct before confirming the operation succeeded
- Test on mobile (site is responsive, many users are mobile)
- Keep vanilla JS — no frameworks, no npm dependencies on frontend
- New agents follow the pattern: landing page HTML + app page HTML + /api/ function + js/ client logic
