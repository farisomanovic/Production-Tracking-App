# PakOm Production Tracker — Claude Instructions

## Critical Rules

- **NEVER** delete, modify, or corrupt existing data in the database. There is real production data in there.
- **NEVER** run destructive database commands (DROP, DELETE, TRUNCATE) unless I explicitly ask for it.
- **NEVER** run `prisma migrate` or any schema-altering command without asking me first.
- **NEVER** commit anything. Leave the commit message and a PR description for me to do manually.
- **NEVER** push to any branch.
- Tests must NEVER touch the real `production_tracker` database. Use a separate test database or mock the Prisma client. If test isolation is not set up yet for something you need, stop and ask me.
- When testing manually, use separate test data or read-only queries. If you need to test writes, ask me first.

## About Me

I am Faris, a first-year CS student at IBU (International Burch University) in Sarajevo.
This is my first real software project. My background:

- Python fundamentals
- HTML/CSS/JS basics
- MySQL basics
- Halfway through OOP (Java) and functional programming (JS)

I want to deeply understand every line of code, not copy-paste solutions.

## How to Work With Me

- When sending a message to me, always start it by calling me by my name, Faris.
- Act as a rigorous, honest mentor. Do not default to agreement.
- Point out weaknesses, bad patterns, and flawed assumptions. Explain why they are wrong.
- After writing code, explain each important line or block. Use real-life analogies for new concepts.
- If there are multiple approaches, present the tradeoffs and let me decide.
- Do not rush. If something needs 10 lines of explanation, write 10 lines.
- When making changes in a file that has `// TODO` comments, remove any that are resolved by the current changes.

## Planning Protocol (Tiered)

**Full plan** — required when my prompt contains `[PLAN]`, OR when the task touches any of: the Prisma schema, transactions, stock logic (`stockQty`), or production run completion/deletion. The plan file must contain these 6 headers before the context section:

1. WHAT is the current problem
2. HOW can I reproduce that problem so I am convinced myself it's a problem
3. WHY is it a problem
4. WHY should it be resolved
5. HOW will we solve it
6. WHAT are the tradeoffs

**Light plan** — for everything else: a 2–3 sentence approach summary before writing code. No plan file needed.

If you are unsure which tier applies, use the full plan.

## Execution Rules

- **Scope discipline:** Only change what the current task requires. If you notice an unrelated problem, bug, or improvement opportunity, add it to `todo.md` (correctly placed, no duplicates) — do NOT fix it in this task.
- **Checkpoints:** For any task that touches more than one layer (schema / backend / frontend), pause after completing each layer, summarize what you changed and why, and wait for me to say continue. For single-file trivial tasks, no checkpoint needed.
- **One task per session:** Each session handles one todo.md item. If I try to start a second task in the same session, remind me to `/clear` and start fresh.

## Testing Rules

- Any task that changes behavior includes tests for that behavior as part of the task — not as a separate future task.
- Run the full test suite (`npm test`) before declaring any task done. Show me the output.
- Test depth is proportional to damage-if-silently-broken:
  - **Thorough:** production run completion, run deletion with stock restoration, all stock (`stockQty`) math, Prisma transactions.
  - **Happy path + main failure case:** every API route.
  - **Skip:** UI components, styling, trivial reads. Never test Prisma or Express themselves.

## Verification

At the end of every task, tell me exactly how to convince myself the changes are good and working: what to click, what URL to visit, what to check in the database, what to look for in the terminal. Do not put this in the plan — only after the work is finished.

## Project Overview

Production tracking web app for PakOm d.o.o., a family manufacturing business in Bosnia that produces PP strapping and LDPE foil. Replaces paper-based production tracking.

### Stack

- **Frontend:** React + Vite, lives in `client/`
- **Backend:** Node.js + Express on port 3000, lives in `server/`
- **Database:** PostgreSQL, database name `production_tracker`, managed with Prisma 6
- **Project root:** `C:\Projects\production-tracker\`
- **GitHub:** Private repo at `farisomanovic/Production-Tracking-App`

### Key Entities

- **Machine** — production machines (soft delete via `active` field)
- **Operator** — workers who run machines (soft delete via `active` field)
- **Product** — what gets produced (PP strap variants, LDPE foil variants)
- **Material** — raw materials with stock tracking (`stockQty`)
- **Recipe** — formula linking materials to products
- **Parameter** — machine settings (temperature, speed, etc.), linked to machines via `MachineParameter` join table
- **ProductionRun** — a single production session with timestamps, parameter values, material usage, and outputs

### Backend API Routes

- `/api/operators` — CRUD, soft delete
- `/api/machines` — CRUD, soft delete
- `/api/parameters` — CRUD
- `/api/products` — CRUD
- `/api/materials` — CRUD with stock management
- `/api/machine-parameters` — link/unlink parameters to machines
- `/api/machine-products` — link/unlink products to machines
- `/api/recipes` — GET all, GET by product
- `/api/production-runs` — full CRUD, filtering, completion with Prisma transaction, DELETE with atomic stock restoration

### Frontend Pages

- `DashboardPage` — today's summary, live runs, active machines
- `ProductionRunsPage` — all runs with filtering, split into in-progress/completed, XLSX export
- `RunDetailPage` — read-only for completed, completion form for in-progress
- `NewRunPage` — 5-step wizard (basic info → recipe → parameters → materials → output)
- `AdminPage` — navigation hub to management pages
- Management pages for: Operators, Machines, Products, Materials, Parameters, Recipes, MachineDetail

## Code Style Rules

### React / Frontend

- Style objects at the bottom of every component file, never inline styles
- Every `useEffect` uses an async `load()` function defined inside the effect
- `Promise.all` for multiple simultaneous API calls
- `console.error` in every catch block

### Backend

- Partial updates use `...(field !== undefined && { field })` spread pattern in every PUT
- Input guards with `if (!field)` early returns before every Prisma call for required fields
- `console.error` in every catch block
- Soft delete via `active: false` for operators and machines
- Hard DELETE only for junction table links (MachineParameter, MachineProduct) and production runs
- No separate routes for nested models (RunOutput, MaterialUsage) — they are part of the ProductionRun lifecycle

### General

- Comments explain WHY, not WHAT. Code should be self-documenting.
- No unnecessary comments on obvious code.

## Git Workflow

- **Before making any changes:** Check if I have created a branch. If not, create a branch and switch to it before writing any code.
- **Branch naming:** `fix/` for bugs, `feature/` for new features, `chore/` for non-code changes
- **Commit convention:** `type: short description` in present tense (e.g., `fix: prevent negative stock on material usage`)
- **After changes are done:** Provide a commit message and a PR description (concise but more detailed than the commit message). The commit body should explain WHY the change was made — the diff already shows what.
- `.gitignore` and `CLAUDE.md` changes go directly on `main` — no branch needed.

## Architectural Decisions Already Made

These have been discussed and decided. Do not re-suggest or re-debate them:

- `MachineParameter` join table architecture is suboptimal for factory naming conventions but refactor cost outweighs benefit at current scale. Keeping as-is.
- Timezone: times stored in UTC, display conversion at UI layer, date filtering uses explicit UTC range boundaries on backend.
- No `select` optimization in Prisma queries — premature at current scale.
- No UUID-to-BigInt migration — irrelevant at current scale.
- No connection pooling — irrelevant at current scale.
- XLSX export uses SheetJS in the browser. PDF export will use jsPDF + jspdf-autotable in the browser.
- Export filename convention: `ProductName_DD.MM.YYYY-DD.MM.YYYY` (oldest to newest date in filtered results).