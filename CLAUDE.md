# FixFlow A103 — AI Warranty Dispatch System

## Project Overview

Internal SaaS for warranty department of A103 residential company. Warranty manager receives 30–50 repair requests/day from apartment owners across 3 residential complexes. Currently handled manually: 10–15 min per request = up to 12 hours/day of routine work.

**Solution**: Owners submit requests via Telegram bot → Claude Sonnet classifies problem type and priority → system auto-routes to responsible contractor's Telegram channel → manager monitors everything on a web dashboard.

**Target users**: 1–2 warranty managers (web dashboard only). Apartment owners and contractors interact exclusively via Telegram.

**Deadline**: 2-week MVP.

**Full spec**: `SPEC.md` | **Business context**: `PROJECT_IDEA.md`

---

## Tech Stack

Stack is **fixed** — no alternatives, no substitutions.

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js | 16 (App Router) |
| Language | TypeScript | latest |
| Styling | Tailwind CSS | 4.x |
| UI Components | shadcn/ui | latest |
| Database | Supabase PostgreSQL | 15+ |
| Auth | Supabase Auth | — |
| AI | Anthropic Claude Sonnet | claude-sonnet-4-5 |
| Messaging | Telegram Bot API | 7.x |
| Deployment | Vercel | — |

---

## User Roles

| Role | Interface | Auth |
|---|---|---|
| `manager` | Web dashboard (`/dashboard`) | Supabase Auth JWT (httpOnly cookie) |
| `contractor` | Telegram bot (inline buttons) | Telegram chat_id |
| `owner` | Telegram bot (conversation flow) | Telegram chat_id |
| `system` | Cron jobs, webhooks | Secret headers |

---

## Project File Structure

```
src/
├── app/
│   ├── (auth)/
│   │   └── login/                    # /login page
│   ├── (dashboard)/
│   │   └── dashboard/
│   │       ├── page.tsx              # Main dashboard (KPI + requests table)
│   │       ├── requests/
│   │       │   └── [id]/             # Request detail page
│   │       ├── contractors/          # Contractors CRUD
│   │       ├── apartments/           # Apartments CRUD + contractor binding
│   │       ├── complexes/            # Residential complexes CRUD
│   │       ├── reports/              # Analytics + XLSX export
│   │       └── settings/             # App settings
│   └── api/
│       ├── requests/
│       │   ├── route.ts              # GET list, POST create
│       │   └── [id]/
│       │       ├── route.ts          # GET, PATCH, DELETE
│       │       ├── reclassify/       # POST — manual AI retry
│       │       ├── reassign/         # POST — change contractor
│       │       └── comment/          # POST — add comment
│       ├── contractors/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── apartments/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── complexes/
│       │   ├── route.ts
│       │   └── [id]/route.ts
│       ├── reports/
│       │   ├── contractor-performance/route.ts
│       │   └── xlsx/route.ts
│       ├── telegram/
│       │   ├── owner/route.ts        # POST — owner bot webhook
│       │   └── contractor/route.ts   # POST — contractor callback webhook
│       └── cron/
│           └── overdue/route.ts      # POST — hourly overdue check
├── agents/                           # AI classification agent
│   ├── config/                       # System prompts, model config
│   ├── tools/                        # Custom tools (category validator, etc.)
│   ├── handlers/                     # API request handlers
│   └── types.ts
├── components/
│   ├── ui/                           # shadcn/ui base components
│   ├── dashboard/                    # Dashboard-specific components
│   └── forms/                        # Form components
├── lib/
│   ├── supabase/                     # Supabase client (server + client)
│   ├── telegram/                     # Telegram Bot API helpers
│   ├── ai/                           # Claude classification wrapper
│   └── utils/                        # Shared utilities
└── types/                            # Global TypeScript types
```

---

## Key Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run type-check   # TypeScript check (tsc --noEmit)
npm run lint         # ESLint
```

---

## Database Schema (Supabase)

All tables have RLS enabled. Manager access via `is_manager()` function. All tables have `updated_at` auto-trigger.

### Tables

| Table | Purpose |
|---|---|
| `residential_complexes` | ЖК (name, address) |
| `apartments` | Квартиры — owner contact, phone, warranty expiry date, complex_id, building, number |
| `contractors` | Подрядчики — name, Telegram channel_id, categories[], phone |
| `apartment_contractors` | Junction: (apartment_id, category) → contractor_id |
| `requests` | Заявки — core table, see below |
| `request_photos` | Фото заявки (Storage bucket: request-photos) |
| `request_completion_photos` | Фото выполнения подрядчиком (Storage bucket: completion-photos) |
| `request_status_history` | Audit trail for status changes |
| `manager_profiles` | Extends auth.users (display name, etc.) |
| `owner_consents` | 152-ФЗ consent (text snapshot, timestamp, revocation) |
| `ai_classification_log` | AI call tracking — model, tokens, cost, confidence, result |
| `app_settings` | Key-value config (business hours, SLA days, etc.) |
| `telegram_bot_states` | Conversation state for owner registration flow |

### `requests` table key fields

```
id, apartment_id, description, status, priority,
category (AI-assigned), ai_confidence, ai_raw_response,
contractor_id, deadline, created_at, updated_at,
telegram_message_id (in contractor channel), requires_manual_review
```

### Status flow

```
new → ai_processing → routed → accepted → in_progress → completed
                   ↘ requires_manual_review (AI confidence < 0.5)
```

### 8 Problem Categories

`electrical` | `plumbing` | `hvac` | `structural` | `windows_doors` | `finishing` | `appliances` | `other`

### Deadline Calculation

`NOW() + 5 business days`, 18:00 MSK cutoff. No holiday support in MVP.

---

## AI Classification Agent

**Location**: `src/agents/`  
**Model**: `claude-sonnet-4-5` via Anthropic Messages API (not Agent SDK)  
**Cost**: ~$0.006 per classification | **Rate limit**: 200/day

### Flow

1. Request created with `status = 'ai_processing'`
2. Call Claude Sonnet with description + photos (base64)
3. Claude returns `{ category, priority, confidence, reasoning }`
4. If `confidence < 0.5` → `requires_manual_review = true`
5. On success → lookup `apartment_contractors` → dispatch to Telegram channel
6. Retry on timeout: wait 5s → retry → wait 30s → retry → mark manual

### Prompts location

`src/agents/config/` — system prompt defines 8 categories, output JSON schema, few-shot examples.

---

## Telegram Bots

### Owner Bot (`TELEGRAM_BOT_TOKEN`)

**Webhook**: `POST /api/telegram/owner`  
**Verification**: `?secret=TELEGRAM_BOT_SECRET` in URL

**Registration flow**:
```
/start → consent (inline buttons) → ФИО → phone → 
select complex → select building → select apartment → ✓ registered
```

State persisted in `telegram_bot_states` table.

**Post-registration**: Owner sends message → creates request → AI processes.

### Contractor Bot (`TELEGRAM_CONTRACTOR_BOT_TOKEN`)

**Webhook**: `POST /api/telegram/contractor`  
**Verification**: `?secret=TELEGRAM_CONTRACTOR_BOT_SECRET`

Receives: new request cards with inline buttons (Accept / Decline / Complete + photo)  
Sends: sendPhoto / sendMediaGroup with caption when request has photos.  
Retry: 3x with exponential backoff on send failure.

---

## API Endpoints Quick Reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/requests` | List with filters (status, category, contractor, date) |
| POST | `/api/requests` | Create request |
| GET | `/api/requests/[id]` | Get request detail |
| PATCH | `/api/requests/[id]` | Update status / fields |
| DELETE | `/api/requests/[id]` | Delete request |
| POST | `/api/requests/[id]/reclassify` | Manual AI retry |
| POST | `/api/requests/[id]/reassign` | Change contractor |
| POST | `/api/requests/[id]/comment` | Add comment |
| GET | `/api/contractors` | List contractors |
| POST | `/api/contractors` | Create contractor |
| GET/PATCH/DELETE | `/api/contractors/[id]` | Contractor CRUD |
| GET | `/api/apartments` | List apartments |
| POST | `/api/apartments` | Create apartment |
| GET/PATCH/DELETE | `/api/apartments/[id]` | Apartment CRUD |
| GET | `/api/complexes` | List complexes |
| POST | `/api/complexes` | Create complex |
| GET/PATCH/DELETE | `/api/complexes/[id]` | Complex CRUD |
| GET | `/api/reports/contractor-performance` | Contractor stats |
| GET | `/api/reports/xlsx` | Export XLSX |
| POST | `/api/telegram/owner` | Owner bot webhook |
| POST | `/api/telegram/contractor` | Contractor callback webhook |
| POST | `/api/cron/overdue` | Hourly overdue notification check |

---

## Environment Variables

All vars go in `.env.local` — **never commit to git**.

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=          # Server-side only — never expose to client

# Anthropic
ANTHROPIC_API_KEY=

# Telegram — Owner Bot
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_SECRET=                # Webhook verification token

# Telegram — Contractor Bot
TELEGRAM_CONTRACTOR_BOT_TOKEN=
TELEGRAM_CONTRACTOR_BOT_SECRET=

# System
CRON_SECRET=                        # x-cron-secret header for cron endpoint
NEXT_PUBLIC_APP_URL=                # e.g. https://fixflow.vercel.app
```

---

## Security Rules

**CRITICAL — never violate these**:

1. `SUPABASE_SERVICE_ROLE_KEY` is **server-side only** — never import in client components or expose to browser
2. All database mutations go through RLS or service_role; anon key can only read public data
3. Telegram webhook routes verify `?secret=` query param before processing any payload
4. Cron endpoint requires `x-cron-secret` header matching `CRON_SECRET` env var
5. Manager auth: Supabase Auth JWT stored in httpOnly cookie (not localStorage)
6. Rate limits:
   - Telegram webhooks: 30 messages/min per `chat_id`
   - Manager API: 100 requests/min per session
   - AI classification: 200 calls/day hard limit
7. Owner photos stored in private Storage bucket — access only via signed URLs
8. 152-ФЗ compliance: owner consent stored with full text snapshot; support deletion on request; AI logs purged after 90 days

---

## Development Guidelines

### Do

- Use `src/lib/supabase/server.ts` for all server-side DB access
- Use `src/lib/supabase/client.ts` only for client components that read non-sensitive data
- Validate all API inputs with **Zod** schemas (see SPEC Block 3 for schemas)
- Return consistent error shapes: `{ error: { code, message, details? } }`
- Log AI calls to `ai_classification_log` table on every invocation
- Use `request_status_history` trigger-or-insert for every status change

### Don't

- Don't create new DB access patterns outside `src/lib/supabase/`
- Don't call Anthropic API directly from frontend — always via server route
- Don't skip RLS — use service_role only when anon/user key is insufficient
- Don't store secrets in code, comments, or git history
- Don't add holiday-awareness to deadline calculation (not in MVP scope)
- Don't add analytics beyond what's specified in SPEC Block 4

### Code style

- TypeScript strict mode — no `any`
- Server Components by default; add `'use client'` only when needed
- shadcn/ui for all UI primitives — don't build custom component library
- Tailwind utility classes — no custom CSS files

---

## Subagent Team

This project uses 5 specialized Claude subagents (defined in `.claude/agents/`):

| Agent | Model | Responsibility |
|---|---|---|
| `database-architect` | Opus | Schema design, Supabase migrations, RLS policies, indexes |
| `backend-engineer` | Sonnet | API routes, business logic, Telegram bot handlers, cron |
| `frontend-developer` | Sonnet | React components, dashboard UI, shadcn/ui integration |
| `ai-agent-architect` | Opus | Claude classification agent, prompt engineering, AI cost optimization |
| `qa-reviewer` | Sonnet | Code review, security audit, test coverage (read-only, no Write access) |

---

## Success Metrics (MVP)

Used for prioritization — these are the criteria that matter:

| Metric | Target |
|---|---|
| Requests processed in week 1 | ≥ 100 |
| Submission → contractor time | ≤ 5 min (was 15 min) |
| AI classification accuracy | ≥ 85% |
| Manager daily workload | ≤ 2 hours (was 5–12 hours) |
| Lost requests | 0 |
| Scale without new hire | owners can double without hiring |
