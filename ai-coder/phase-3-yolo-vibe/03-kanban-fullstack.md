# Bài 3: Kanban Full-Stack Project — Copilot + Docker + Tests

Phase 2 đã build Kanban đơn lẻ. Phase 3 lên level: **full-stack production** với backend API, Postgres DB, Docker Compose, integration tests, deploy. Project khóa: build cùng GitHub Copilot Edits trong VS Code, áp dụng 5 principles, end với deployable app.

## Architecture

```text
[Frontend Next.js]
      │ REST API
      ▼
[Backend FastAPI]
      │ SQL
      ▼
[Postgres]

[Docker Compose dev]
- frontend (Next.js dev server)
- backend (FastAPI uvicorn)
- db (Postgres 16)
- adminer (DB UI)
```

## Step 1: Spec file

`spec.md`:
```markdown
# Kanban Full-Stack App

## Goal
Multi-user Kanban board with persistence + real-time-ish sync.

## Stack
- Frontend: Next.js 15 + TypeScript + Tailwind + shadcn/ui + @dnd-kit
- Backend: FastAPI (Python 3.12) + SQLAlchemy 2.0 + Pydantic v2
- DB: PostgreSQL 16
- Dev: Docker Compose
- Tests: pytest (backend), vitest (frontend), Playwright (e2e)

## Features
- Boards: create, list, delete
- Columns: 3 default per board (Todo/Progress/Done)
- Cards: CRUD (title, description)
- Drag-and-drop cards across columns
- Polling sync (refresh every 3s)

## Non-goals (for v1)
- No auth (single-user demo)
- No real-time WebSocket
- No mobile responsive perfect
- No comments/attachments

## Acceptance
- All tests pass
- Docker compose up → works in browser
- Lint + type check clean
- README with setup steps
```

→ Spec rõ. AI biết scope.

## Step 2: agents.md

```markdown
# agents.md

## Project layout
- /frontend — Next.js 15 App Router
- /backend  — FastAPI + SQLAlchemy
- /db       — migration SQL (uses Alembic)
- /e2e      — Playwright tests

## Backend conventions
- Async functions everywhere
- DB session via `Depends(get_db)`
- Pydantic schemas in `app/schemas/`
- Routes in `app/routes/`, one file per resource
- Use SQLAlchemy 2.0 `select()` syntax (NOT 1.x query())

## Frontend conventions
- Server components by default
- Client components only with `'use client'`
- API calls via `lib/api.ts` (single fetcher)
- Form state with react-hook-form + zod
- Tailwind only

## Commands
- Dev:     docker-compose up
- Tests:   cd backend && pytest ; cd frontend && pnpm test
- Lint:    cd backend && ruff check . ; cd frontend && pnpm lint

## Don'ts
- Don't add ORM other than SQLAlchemy
- Don't use Pages Router
- Don't add auth (out of scope v1)
- Don't bypass Pydantic validation

## Where things are
- API routes: backend/app/routes/
- DB models: backend/app/models/
- Schemas:   backend/app/schemas/
- Frontend pages: frontend/app/
- Components: frontend/components/
- API client: frontend/lib/api.ts
```

## Step 3: Scaffold với Copilot Edits

```text
[Open Copilot Edits in VS Code]

Prompt:
"Per spec.md and agents.md, scaffold the project:
1. Create /backend with FastAPI 'hello world' endpoint
2. Create /frontend with Next.js 15 + Tailwind + shadcn init
3. Create docker-compose.yml with backend, frontend, postgres, adminer
4. Create README.md with setup instructions
Use latest stable versions."
```

Copilot Edits:
1. Generate `backend/pyproject.toml` với FastAPI, uvicorn, sqlalchemy, asyncpg.
2. Generate `backend/app/main.py` — FastAPI app.
3. Generate `backend/Dockerfile`.
4. `frontend/` — Next.js scaffold.
5. `frontend/Dockerfile`.
6. `docker-compose.yml`.
7. `README.md`.

Review diff per file. Accept.

```bash
docker-compose up
# Visit http://localhost:3000 (frontend)
# Visit http://localhost:8000/docs (FastAPI swagger)
# Visit http://localhost:8080 (Adminer)
```

## Step 4: DB models

```text
Prompt:
"Add SQLAlchemy 2.0 models in backend/app/models/:
- Board(id UUID, name, created_at)
- Column(id UUID, board_id FK, name, position)
- Card(id UUID, column_id FK, title, description, position)

Add Alembic migrations. Auto-create 3 default columns when board created.
Use bigint position with float-style ordering trick."
```

Copilot:
1. `app/models/board.py`, `column.py`, `card.py`.
2. `alembic/versions/001_init.py`.
3. Update `app/main.py` để run migrations on startup.

## Step 5: API routes

```text
Prompt:
"Add CRUD endpoints in app/routes/:

POST   /boards               create
GET    /boards               list
GET    /boards/{id}          get with columns + cards
DELETE /boards/{id}          delete cascade

POST   /cards                create (with column_id)
PATCH  /cards/{id}           update (title, desc, column_id, position)
DELETE /cards/{id}           delete

Use Pydantic schemas in app/schemas/.
Return 404 for missing resources.
Add OpenAPI tags."
```

Verify với Swagger UI:
```bash
curl -X POST localhost:8000/boards -d '{"name":"My Board"}' -H "Content-Type: application/json"
curl localhost:8000/boards
```

## Step 6: Frontend API client

```text
Prompt:
"Create frontend/lib/api.ts:
- fetcher() with NEXT_PUBLIC_API_URL base
- API methods: getBoards, getBoard, createBoard, deleteBoard,
  createCard, updateCard, deleteCard
- TypeScript types matching backend Pydantic
- Throw on non-2xx

Add frontend/lib/queries.ts with React Query hooks for each."
```

## Step 7: Frontend pages

```text
Prompt:
"Build pages:
- /                    → list boards, button 'New Board'
- /boards/[id]         → board view with 3 columns + cards

For board view:
- @dnd-kit for drag-and-drop
- Edit card → modal
- Add card → button in column → modal
- Delete card → X button on card
- Refresh every 3s (use React Query refetchInterval)

UI: shadcn Card for cards, Dialog for modals."
```

Copilot xây multi-file. Review diff. `pnpm dev` thử.

## Step 8: Backend tests

```text
Prompt:
"Add pytest tests in backend/tests/:
- test_boards.py: CRUD happy path + 404
- test_cards.py: CRUD + cross-column move
- Use TestClient + override DB dependency with SQLite memory

Add pyproject script: pytest with coverage."
```

```bash
cd backend && pytest --cov
```

## Step 9: Frontend tests

```text
Prompt:
"Add vitest tests in frontend/__tests__/:
- API client mock + assert call shape
- BoardList component renders list
- Card component drag handler called

Add Playwright e2e in /e2e:
- Create board → see in list
- Add card → see in column
- Drag card to another column → persists after refresh"
```

```bash
cd frontend && pnpm test
cd e2e && pnpm playwright test
```

## Step 10: Polish + deploy

```text
Prompt:
"Final polish:
- Add loading states (skeleton)
- Add error toast on API failure
- Add empty state ('No boards yet')
- Add board name validation (1-100 chars)
- Add Dockerfile.prod for backend (multi-stage)
- Add vercel.json for frontend
- Update README with deploy steps"
```

Deploy:
```bash
# Backend → Railway / Render / Fly.io
fly launch -y --no-deploy
fly deploy

# Frontend → Vercel
vercel link
vercel env add NEXT_PUBLIC_API_URL https://yourapp.fly.dev
vercel deploy --prod
```

## Bài học rút ra

### 1. Spec phải có **trước**, không sau

```text
[Without spec]
"Build Kanban app"
→ AI build random.
→ Scope creep.
→ 5x time.

[With spec]
[5 min spec]
"Build per spec.md"
→ AI focused.
→ Predictable output.
```

### 2. agents.md là leverage 10x

```text
[Without agents.md]
- Mỗi turn AI re-discover conventions
- Style inconsistent
- Re-explain hộ "use SQLAlchemy 2.0 syntax" mỗi feature

[With agents.md]
- AI biết stack ngay
- Style consistent
- Add feature = 1 prompt
```

### 3. Test sớm = save thời gian

```text
[Skip test]
- Manual UI test sau mỗi change
- Regression bug khó catch
- Refactor sợ break

[Test first]
- AI write test alongside feature
- Catch regression ngay
- Refactor confident
```

### 4. Docker = sandbox + portability

```text
[Without Docker]
- "Works on my machine"
- Teammate setup khó
- AI may install conflicting deps

[With Docker Compose]
- Identical dev env
- Reset dễ: docker compose down -v
- Production parity
```

### 5. Small commits

```text
[Anti]
- 1 commit "build Kanban app"
- 50 files changed
- Cannot rollback partial

[Pro]
- "feat: add Board model"
- "feat: add Board CRUD routes"
- "feat: add Board list page"
- ...
- Each tested
- Easy to bisect
```

## Bẫy thường gặp

| Bẫy | Hậu quả | Tránh bằng |
|---|---|---|
| Spec mơ hồ "build Kanban" | Output sai scope | Detailed spec.md |
| Skip Docker | "works on my machine" | docker-compose từ ngày 1 |
| Backend + frontend cùng commit | Khó review | Tách per layer |
| Test sau cùng | Regression khó debug | Test alongside feature |
| Bỏ qua migration | Schema drift | Alembic từ đầu |
| Hardcode localhost:8000 | Deploy fail | NEXT_PUBLIC_API_URL env |
| Skip CORS | Browser block | FastAPI CORS middleware |
| AI viết tests pass-by-coincidence | False security | Manual sanity check tests |

## Production checklist

```text
✓ All endpoints have OpenAPI tags
✓ All endpoints have tests
✓ DB migrations versioned
✓ Frontend handles loading + error
✓ CORS configured
✓ Env vars documented
✓ Docker compose works
✓ Production Dockerfile multi-stage
✓ README onboarding steps
✓ License + .gitignore
✓ Deployment runbook
```

## Tóm tắt bài 3

- Build full-stack Kanban: Next.js + FastAPI + Postgres + Docker.
- 10 steps: spec → agents.md → scaffold → models → API → frontend → tests → polish → deploy.
- 5 bài học: spec first, agents.md leverage, test sớm, Docker sandbox, small commits.
- Copilot Edits multi-file works tốt cho production code.
- Production checklist 11 items trước ship.

🎉 **Hoàn thành Phase 3** — bạn đã build full-stack app với Copilot + spec-driven workflow. Phase 4 chuyển sang **Claude Code** — pinnacle của CLI agent.

**Bài kế tiếp** → [Phase 4 - Bài 1: Claude Code Setup + History](../phase-4-claude-code-basics/01-claude-code-setup.md)
