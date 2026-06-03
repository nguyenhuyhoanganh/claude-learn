# Bài 2: AI Legal Doc SaaS — Production build với Cerebras

Project flagship Week 2: build **AI Legal Document Generator** — SaaS thật, FastAPI backend + Next.js frontend + Cerebras inference (1500 tok/s), Jira-driven dev. Bài này là **template** cho mọi SaaS bạn sẽ build sau này: từ ý tưởng → 5 ticket → 5 PR merged → deployed.

## Product spec

```text
[AI Legal Doc Generator]

User flow:
1. Upload existing contract OR start blank
2. Pick template (NDA, employment, service agreement, ...)
3. Fill structured form (parties, terms, jurisdiction)
4. AI generates legal doc with proper language
5. Edit inline
6. Export PDF
7. (Pro tier) e-sign integration

Tech:
- Backend: FastAPI + PostgreSQL + Redis
- Frontend: Next.js 15 + Tailwind + shadcn
- Inference: Cerebras (Llama 3.3 70B @ 1500 tok/s)
- Auth: Clerk
- Payment: Stripe
- PDF: WeasyPrint
- Deploy: Vercel (FE) + Fly.io (BE)
```

## Vì sao Cerebras?

```text
[Standard LLM API]
GPT-5.2:        ~80 tok/s
Sonnet 4.5:     ~80 tok/s
Gemini 3:       ~120 tok/s

[Cerebras hosted]
Llama 3.3 70B:  ~1500 tok/s  ← 15-20x faster
Same quality (Llama models).

[Use case fit]
- User waits → typing animation matters
- Long doc generation (5-10 page contract)
- 30s on standard vs 2s on Cerebras
- → Cerebras feels instant
```

## Project plan as Jira tickets

```text
[Sprint: AI Legal Doc MVP]

DOC-1: Project scaffold (FastAPI + Next.js + Docker)
DOC-2: Auth via Clerk (FE + BE integration)
DOC-3: Document templates schema + 5 templates seeded
DOC-4: AI generation endpoint with Cerebras
DOC-5: Form → AI generate → display flow (FE)
DOC-6: Save document to DB, list user's documents
DOC-7: Export to PDF
DOC-8: Stripe subscription gate (Pro for unlimited gen)
DOC-9: Deploy to Vercel + Fly.io
```

Each ticket = 1-2 hour agent work.

## CLAUDE.md

```markdown
# Project: AI Legal Doc Generator

## Stack
- Backend: FastAPI 0.115 + SQLAlchemy 2.0 + asyncpg
- Frontend: Next.js 15 App Router + Tailwind + shadcn/ui + Clerk
- Inference: Cerebras Llama 3.3 70B (via cerebras-cloud-sdk)
- DB: PostgreSQL 16

## Conventions
- Backend async everywhere
- Pydantic v2 for schemas
- Routes in app/routes/, schemas in app/schemas/
- Frontend: server components default, 'use client' only when needed
- API client in lib/api.ts, single fetcher
- Forms: react-hook-form + zod
- UI: shadcn components only (no Material/Chakra)

## Auth
- Clerk handles auth
- Backend verifies Clerk JWT (use clerk-sdk-python)
- User ID = Clerk's user_id (varchar 255)

## AI
- Cerebras API key in env CEREBRAS_API_KEY
- Model: llama-3.3-70b
- Stream responses
- Temp 0.3 for legal accuracy

## Don'ts
- No OpenAI/Anthropic for generation (use Cerebras only)
- No Stripe for free tier (gate via Clerk metadata)
- No raw SQL (use SQLAlchemy 2.0)
- Don't modify migrations after commit

## Commands
- Dev: docker compose up
- Tests: cd backend && pytest; cd frontend && pnpm test
- Lint: ruff check backend; pnpm lint frontend
- DB shell: docker exec -it postgres psql -U postgres
```

## DOC-1: Scaffold (60 min agent)

```text
> /ship-ticket DOC-1

[Agent fetches DOC-1]
DOC-1: "Project scaffold: FastAPI 'hello world' backend, Next.js frontend
with Clerk integrated (signed in/out states), Docker compose with Postgres,
Redis, Adminer, MailHog."

[Agent implements]
- Create backend/{pyproject.toml,app/main.py,Dockerfile,alembic.ini}
- Create frontend/{package.json,app/layout.tsx,middleware.ts}
- Create docker-compose.yml
- Create README.md
- git checkout -b feat/DOC-1-scaffold
- Commit + open PR
```

Verify locally:
```bash
docker compose up
# FE http://localhost:3000 — Clerk sign-in works
# BE http://localhost:8000/docs — FastAPI swagger
# DB http://localhost:8080 — Adminer
```

## DOC-2: Clerk auth (45 min)

```text
> /ship-ticket DOC-2

[Agent]
- Backend: install clerk-sdk-python
- backend/app/security/clerk.py — verify_jwt dependency
- All protected endpoints use Depends(verify_jwt) → User
- Frontend: use Clerk's <SignIn />, <UserButton />
- middleware.ts: protect /dashboard route
- Test: pytest backend/tests/test_auth.py
- PR opened
```

## DOC-3: Templates schema (30 min)

```text
> /ship-ticket DOC-3

[Agent]
- DB model: Template(id, slug, name, category, prompt_template, form_schema JSONB)
- Seed 5 templates:
  - NDA (mutual)
  - Employment Agreement
  - Service Agreement  
  - Freelance Contract
  - Partnership Agreement
- API: GET /api/templates, GET /api/templates/{slug}
- Migration via Alembic
- PR opened
```

## DOC-4: AI generation endpoint (90 min)

```text
> /ship-ticket DOC-4

[Agent]
- Install cerebras-cloud-sdk
- backend/app/services/ai.py:

```python
from cerebras.cloud.sdk import AsyncCerebras

client = AsyncCerebras(api_key=settings.CEREBRAS_API_KEY)

async def generate_document(template: Template, inputs: dict) -> AsyncIterator[str]:
    prompt = template.prompt_template.format(**inputs)
    stream = await client.chat.completions.create(
        model="llama-3.3-70b",
        messages=[
            {"role": "system", "content": LEGAL_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        stream=True,
        temperature=0.3,
        max_tokens=8192
    )
    async for chunk in stream:
        if chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content
```

- POST /api/documents/generate streams via SSE
- Test mock Cerebras client
- PR opened
```

## DOC-5: FE generation flow (90 min)

```text
> /ship-ticket DOC-5

[Agent]
- /generate/[template] page
- Dynamic form per template form_schema (zod)
- On submit: open EventSource to /api/documents/generate
- Stream text into editor in real-time
- Inline editing after gen done
- Save button
- PR opened
```

User experience: form → "Generate" → 2-second stream → 5-page contract appears. Feels magical because Cerebras speed.

## DOC-6: Save + list (30 min)

```text
> /ship-ticket DOC-6

[Agent]
- DB: Document(id, user_id, template_id, title, content TEXT, created_at)
- POST /api/documents (save)
- GET /api/documents (list for user)
- GET /api/documents/{id}
- DELETE /api/documents/{id}
- FE: /dashboard page list documents
- PR opened
```

## DOC-7: PDF export (45 min)

```text
> /ship-ticket DOC-7

[Agent]
- Install weasyprint
- backend/app/services/pdf.py: render Document to PDF with legal styling
- GET /api/documents/{id}/pdf
- FE: "Export PDF" button → downloads
- Add letterhead, signatures section
- PR opened
```

## DOC-8: Stripe gate (60 min)

```text
> /ship-ticket DOC-8

[Agent]
- Free tier: 3 generations/month
- Pro tier: unlimited, $20/mo
- Stripe checkout integration
- Webhook updates Clerk metadata (subscription_tier)
- Backend check tier before generate
- FE upgrade banner when limit hit
- PR opened
```

## DOC-9: Deploy (45 min)

```text
> /ship-ticket DOC-9

[Agent]
- Add Dockerfile.prod for backend (multi-stage, distroless)
- Add fly.toml: deploy backend to Fly.io
- vercel.json: env vars listed
- Add CI/CD: GitHub Actions runs tests + deploys on merge to main
- Update README with deploy commands
- PR opened
```

Deploy:
```bash
# Backend
fly auth login
fly launch  # creates app + deploys
fly secrets set CEREBRAS_API_KEY=... CLERK_SECRET_KEY=... DATABASE_URL=...

# Frontend
vercel link
vercel env add (per secret)
vercel deploy --prod
```

→ Live SaaS in ~7-8 hours of agent work spread across the week.

## Production checklist

```text
[Security]
✓ HTTPS only
✓ Clerk auth on all sensitive endpoints
✓ CORS configured (allowlist)
✓ Rate limiting (per user)
✓ Input validation (Pydantic)
✓ SQL parameterized (SQLAlchemy)
✓ Secrets in Vault/Fly secrets (not committed)

[Observability]
✓ Structured logging (slog/Python logger JSON)
✓ Error tracking (Sentry)
✓ Metrics (Prometheus)
✓ Health endpoint /healthz
✓ Cerebras call duration metric

[Reliability]
✓ Graceful shutdown
✓ DB connection pool
✓ Retry on Cerebras transient errors
✓ Circuit breaker if Cerebras down
✓ Fallback model (Sonnet) if Cerebras down >1min

[UX]
✓ Loading states
✓ Error messages user-friendly
✓ Stream feedback (typing animation)
✓ Empty states
✓ Mobile responsive
```

→ Add as `production-checklist.md` skill. Agent applies.

## Lessons from building this

```text
[Lesson 1: Spec → tickets first]
Don't start coding. Map full product → 9 tickets.
Each ticket independent, testable.

[Lesson 2: CLAUDE.md is leverage]
Detailed CLAUDE.md = consistent output across 9 tickets.
Tweak as you learn.

[Lesson 3: Tests catch issues agent doesn't see]
Agent might make code that "looks right" but breaks edge case.
Tests force verification.

[Lesson 4: Cerebras changes UX]
1500 tok/s = "wait, that was just 2 seconds?"
Feature works → users delighted.
Worth premium for inference speed in real-time UX.

[Lesson 5: Streaming SSE > polling]
For AI gen, server-sent events feel native.
User sees text appear like ChatGPT.

[Lesson 6: Stripe + Clerk = boring infra]
Don't reinvent auth or billing.
Focus core product (AI legal gen).

[Lesson 7: Deploy early, iterate live]
DOC-9 (deploy) is mid-sprint, not last.
Production env catches bugs dev env doesn't.
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Skip CLAUDE.md | Inconsistent code | Detailed conventions |
| Build all features parallel | Conflicts | Ticket sequence |
| Don't test AI output | Hallucination prod | Eval suite cho legal accuracy |
| Cerebras key in code | Leak | Env var |
| No rate limit | Abuse | Per-user limit |
| Stripe test mode in prod | Free service | Verify env keys |
| No fallback Cerebras down | Outage | Multi-provider fallback |
| Free tier unlimited | Bill shock | Hard cap |

## Tóm tắt bài 2

- Project: AI Legal Doc Generator SaaS production.
- Cerebras = 15-20x faster than standard providers → magical UX.
- 9 Jira tickets → 9 PRs → live SaaS in ~7-8 hours agent work.
- CLAUDE.md detailed conventions = consistent multi-PR output.
- Tech stack: FastAPI + Next.js + Clerk + Stripe + Cerebras + PostgreSQL.
- Production checklist: security, observability, reliability, UX.
- Lessons: spec first, tests catch agent blindspots, deploy early.
- This is template for any AI SaaS in 2026.

🎉 **Hoàn thành Phase 6** — Vibe Engineering as Professional. Phase 7-10 vào Expert level: sub-agents, hooks, cloud, multi-agent.

**Bài kế tiếp** → [Phase 7 - Bài 1: Sub-agents — Specialized AI workers](../phase-7-subagents-hooks/01-subagents.md)
