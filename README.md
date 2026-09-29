# My-Email-System

AI-powered outbound email operations: an Outreach Agent, a Follow-Up Agent, and a Reply
Intelligence Agent working over one shared lead/campaign database, run from a single-owner
web dashboard.

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL · Auth.js
(NextAuth v5, credentials login) · Gmail API (googleapis) · Google Gemini (AI provider,
swappable) · Vercel (hosting + Cron).

## Status

This build covers the full data model and UI for all three agents, plus working
implementations of:

- Lead CRUD + CSV import (dedupes/updates by email)
- Campaign CRUD, launch/pause/resume/complete with a confirmation step before sending
- Sending Accounts: Gmail OAuth connect flow, per-account daily limits, active/inactive toggle
- Outreach Agent: renders templates, personalizes with AI, rotates sending accounts, enforces
  daily limits and the suppression list, sends via Gmail, records every message
- Reply Intelligence Agent: polls connected inboxes, matches replies to threads by Gmail
  thread/message ID (not subject), detects auto-replies/bounces from headers first and falls
  back to AI classification, updates lead status, cancels future follow-ups on a real reply
- Follow-Up Agent: computes due follow-ups from configurable per-campaign delays, drafts each
  one with AI from the thread so far, and either queues it for review (default) or sends it
  automatically when a campaign has Automatic Mode enabled — always re-checking the thread for
  a reply immediately before sending
- Dashboard, Inbox/Replies review UI, Follow-Up review UI, Settings status page
- Suppression list, idempotent sends (unique key per logical email), audit log, background
  job tracking

**Known limitations** (call these out to the owner rather than treating them as bugs):

- Google Sheets sync is scaffolded (schema + Integrations page) but the actual two-way sync
  is not wired up yet.
- Vercel serverless functions can't sleep for a full multi-minute "delay between sends" —
  pacing comes from cron frequency (`vercel.json`) plus a short per-send jitter, not a real
  in-process sleep. For high-volume needs, replace `/api/cron/send-campaigns` with a proper
  queue (e.g. Vercel Queues, QStash, or a small worker).
- OAuth CSRF `state` is generated but not verified against a stored value (acceptable for a
  single-admin internal tool; harden before opening this to multiple users).

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in the values below
npm run db:push              # create tables from prisma/schema.prisma
npm run dev
```

Visit `http://localhost:3000` — you'll be redirected to `/login`.

### Required environment variables

See `.env.example` for the full list with generation commands. At minimum, to log in and
browse the app:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. Any free-tier managed Postgres works (Neon, Supabase, Vercel Postgres, Railway). |
| `AUTH_SECRET` | Signs session cookies. `openssl rand -base64 32` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD_HASH` | Your login. Hash a password with `node -e "console.log(require('bcryptjs').hashSync('yourpassword', 12))"` |

To connect a Gmail sending account and enable the agents, also set:

| Variable | Purpose |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` | OAuth client from Google Cloud Console with the Gmail API enabled (scopes: `gmail.send`, `gmail.readonly`, `gmail.modify`, `userinfo.email`). Redirect URI must be `{APP_URL}/api/sending-accounts/google/callback`. |
| `TOKEN_ENCRYPTION_KEY` | Encrypts stored OAuth tokens (AES-256-GCM). `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Free-tier Google Gemini key, used for personalization, classification, and follow-up drafts. The app runs without it (falls back to safe defaults / human review) but agents work much better with it set. |
| `CRON_SECRET` | Required by the four `/api/cron/*` job endpoints. Vercel automatically sends it as `Authorization: Bearer $CRON_SECRET` for scheduled cron invocations once this env var is set on the project. `openssl rand -hex 32` |

### Scripts

```bash
npm run dev          # local dev server
npm run build         # prisma generate + next build
npm run typecheck     # tsc --noEmit
npm run lint           # next lint
npm test               # vitest — unit tests for the email safety/classification logic
npm run db:push        # push schema.prisma to DATABASE_URL (no migration history)
npm run db:migrate     # create a tracked migration (use once you have a real Postgres)
npm run db:studio      # Prisma Studio GUI
npm run db:seed        # upsert the ADMIN_EMAIL/ADMIN_PASSWORD_HASH user into the User table
```

## Deploying to Vercel

1. Import the repo into Vercel, project name `My-Email-System`.
2. Set every environment variable above in the Vercel project settings (Production +
   Preview). Never commit real values to `.env.example`.
3. Provision a Postgres database and set `DATABASE_URL`, then run `npm run db:push` (or set
   up `db:migrate` in CI) against it once.
4. `vercel.json` already declares the four cron jobs (`sync-inbox`, `detect-replies`,
   `find-due-followups`, `send-campaigns`). Vercel Hobby plans currently limit cron to lower
   frequencies than what's configured here — adjust the schedules in `vercel.json` to match
   your plan if deploys reject the config.
5. Deploy. `npm run build` runs `prisma generate` automatically via the `build`/`postinstall`
   scripts, so no extra Vercel build command is needed.

## Architecture notes

- **Agents live in `src/lib/agents/`** (`outreach.ts`, `reply-detection.ts`, `follow-up.ts`),
  called both from `/api/cron/*` (scheduled) and directly from API routes for
  human-in-the-loop actions (e.g. "Approve & Send" calls the same `sendFollowUpEmail()` the
  Automatic Mode cron job uses).
- **`src/lib/email/safety.ts`** is the single gate every send path calls before dispatching —
  see its tests in `safety.test.ts` for the exact rules enforced (suppression list, campaign
  status, lead status, daily limits, idempotency).
- **`src/lib/ai/`** defines an `AIProvider` interface with a Gemini implementation
  (`gemini.ts`) selected via `AI_PROVIDER`. Swap providers by adding a new class and a case in
  `ai/index.ts` — no caller changes required.
- **Idempotency**: every `EmailMessage` has a unique `idempotencyKey` derived deterministically
  from the campaign lead + send type (+ follow-up number), so a retried cron run can never
  double-send.

## Testing

`npm test` covers the pure logic behind the "never do X" rules from the spec: no double
sends, no follow-up after a real reply, auto-replies classified separately from human
replies, bounces/unsubscribes permanently suppress the recipient, per-account daily limits
stay independent, and a failed AI classification call degrades to "needs human review"
instead of losing the reply. Full end-to-end behavior (actual Gmail calls, DB writes) needs a
real database and Google test account and isn't covered by this unit suite — recommended next
step is a seeded integration test against a disposable Postgres + Gmail test account.
