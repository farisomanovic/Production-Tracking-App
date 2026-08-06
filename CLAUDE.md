# PakOm Production Tracker — Claude Instructions

## Critical Rules

- **NEVER** delete, modify, or corrupt existing data in the database. There is real production data in there.
- **NEVER** run destructive database commands (DROP, DELETE, TRUNCATE) unless I explicitly ask for it.
- **NEVER** run `prisma migrate` or any schema-altering command without asking me first.
- **NEVER** commit anything. Leave the commit message and a PR description for me to do manually.
- **NEVER** push to any branch.
- Tests must NEVER touch the real `production_tracker` database. Isolation is already set up — see [Test Isolation](#test-isolation) for how it works and what to reuse. If you need something it does not cover, stop and ask me.
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
- **`todo.md` is private and gitignored** (`.gitignore:8`). It never leaves this machine — it does not appear in `git status`, in `git diff`, or in any clone of the repo. Two consequences:
  - Editing it is **not part of the change set.** Do not list it among the files you changed, and do not be confused when it fails to show up in a diff.
  - Nobody but me can resolve a reference to it. That is why the Git Workflow rule on commit and PR messages exists — read it before you write either.

## Testing Rules

- Any task that changes behavior includes tests for that behavior as part of the task — not as a separate future task.
- **There is no root `package.json`.** `npm test` at the project root does not exist and will fail. The suite is per-package, both Vitest — run **both** before declaring any task done, and show me the output:

  ```
  cd server && npm test     # vitest run — tests/ and tests/api/
  cd client && npm test     # vitest run — src/lib/*.test.js
  ```

  Those two commands are the whole suite — there is no third one to remember, and nothing is excluded from them.
- Test depth is proportional to damage-if-silently-broken:
  - **Thorough:** production run completion, run deletion with stock restoration, all stock (`stockQty`) math, Prisma transactions.
  - **Happy path + main failure case:** every API route.
  - **Skip:** UI components, styling, trivial reads. Never test Prisma or Express themselves. (Component tests are not merely discouraged — `client/vitest.config.js` runs `environment: 'node'` with no jsdom, so they cannot run at all right now.)

### Every new test must be seen failing

**A guard that has never failed is not a guard, it is decoration.** A test that has only ever been green proves nothing: it may assert on a value that cannot vary, sit in a file the runner never globs, be an async test missing an `await` (which passes instantly no matter what the code does), or check a condition the code is physically incapable of violating. You cannot tell which of these you have written by looking at a green run. You have to watch it go red.

So for **every** test added in a PR:

1. **Break the exact behavior the test guards.** Invert the comparison, delete the guard clause, return the wrong field, remove the stock decrement. Sabotage the *source*, never the test — a test edited into failing tells you nothing about the code.
2. **Run the suite and confirm that specific test goes red.** Not "some tests failed" — that one, by name.
3. **Read the failure message and check it describes the defect you planted.** A test that dies with a timeout, a `TypeError`, or "cannot read property of undefined" is failing for the *wrong reason* — its assertion is not actually wired to the behavior, and it would have stayed green for the bug you care about. Fix the test and repeat from step 2.
4. **Revert the sabotage, re-run, confirm green.**
5. **Report it.** In the final summary, for each new test: what you broke, and the exact failure message it produced. "All tests pass" is not the deliverable — the red-then-green pair is.

This is **per test, not per file.** Five new `it()` blocks in one file need five separate sabotages: one broken line usually trips only one of them, and the other four stay unproven.

### Test Isolation

Already set up. Do not rebuild it, and do not stop to ask whether it exists.

- Server tests run against a **real Postgres test database**, not a mocked Prisma client — config in `server/.env.test`.
- `server/lib/assertTestDatabase.js` is the safety net: it parses `DATABASE_URL` and `process.exit(1)`s if the database is named `production_tracker` or does not end in `_test`.
- `server/vitest.config.js` sets `fileParallelism: false` — every test file shares one database, so they run serially — and seeds a baseline once per invocation via `globalSetup`.
- `server/tests/helpers.js` exposes `getBaseline()`, which re-fetches the seeded rows by their stable markers. Use it. Never hardcode seeded IDs; `globalSetup` runs in a different process than your test file.
- The single `vi.mock('@prisma/client')` in `server/tests/api/cors.test.js` is a workaround for re-importing `app.js`, not a mocking strategy to copy.

## Verification

At the end of every task, tell me exactly how to convince myself the changes are good and working: what to click, what URL to visit, what to check in the database, what to look for in the terminal. Do not put this in the plan — only after the work is finished.

## Project Overview

Production tracking web app for PakOm d.o.o., a family manufacturing business in Bosnia that produces PP strapping and LDPE foil. Replaces paper-based production tracking.

### Stack

- **Frontend:** React 19 + Vite, lives in `client/`
- **Backend:** Node.js + **Express 5**, lives in `server/`. Port is `process.env.PORT || 3000` (`server/index.js:14`) — 3000 is the default, not a constant.
- **Database:** PostgreSQL, database name `production_tracker`, managed with Prisma 6
- **Project root:** `C:\Projects\production-tracker\`
- **GitHub:** Private repo at `farisomanovic/Production-Tracking-App`
- **No root `package.json`.** `client/` and `server/` are independent npm packages — every `npm` command runs inside one of them.
- **Client env:** `VITE_API_URL` is **required** for production builds; dev falls back to `http://localhost:3000/api`. Resolved by the pure function in `client/src/lib/apiBaseUrl.js`, enforced twice — at build time in `client/vite.config.js` and at runtime in `client/src/api/axiosInstance.js`.

### Key Entities

- **Machine** — production machines (soft delete via `active` field)
- **Operator** — workers who run machines (soft delete via `active` field)
- **Product** — what gets produced (PP strap variants, LDPE foil variants), linked to machines via `MachineProduct` join table
- **Material** — raw materials with stock tracking (`stockQty`)
- **Recipe** — a material formula (soft delete via `active` field). It does **not** hold a `productId`; both of its sides are join tables:
  - **RecipeItem** — one row per material in the formula, holding `percentage`. Percentages must total 100 within `PERCENT_TOLERANCE` (`server/routes/recipes.js`).
  - **RecipeProduct** — links a recipe to the products it can make, carrying `isDefault`. A partial unique index allows at most one default recipe per product.
- **Parameter** — machine settings (temperature, speed, etc.), linked to machines via `MachineParameter` join table
- **ProductionRun** — a single production session with timestamps, parameter values, material usage, and the produced quantity

### Backend API Routes

Mounted in `server/app.js`. **The master-data routes have no DELETE verb** — deactivation is `PUT { active: false }`. Do not assume a DELETE endpoint exists just because a resource does.

- `/api/operators` — GET, GET `/:id`, POST, PUT. Soft delete via PUT.
- `/api/machines` — GET, GET `/:id`, POST, PUT. Soft delete via PUT.
- `/api/parameters` — GET, GET `/:id`, POST, PUT
- `/api/products` — GET, GET `/:id`, POST, PUT
- `/api/materials` — GET, GET `/:id`, POST, PUT. Stock moves via `stockDelta` (an increment) or an absolute `stockQty`.
- `/api/machine-parameters` — GET `/machine/:machineId`, POST, PUT `/:id` (reorders `displayOrder`), DELETE `/:id`
- `/api/machine-products` — GET `/machine/:machineId`, POST, DELETE `/:id`. No PUT — the link has no editable fields.
- `/api/recipes` — GET, GET `/by-product/:productId`, GET `/:id`, POST (nested create of recipe + product links + items), PUT `/:id` (name/notes/active only; items are not editable here)
- `/api/recipe-products` — GET `/recipe/:recipeId`, GET `/product/:productId`, POST, PUT `/:id` (toggles `isDefault`), DELETE `/:id`
- `/api/production-runs` — GET (filtering by machine/operator/product/date range/status), GET `/:id`, POST, PUT `/:id`, **POST `/:id/complete`** (the Prisma transaction that consumes stock — highest-risk endpoint in the app), DELETE `/:id` (atomic stock restoration)
- `GET /ping` — health check, not under `/api`

### Frontend Pages

Routes are declared in `client/src/App.jsx`, which uses `createBrowserRouter` specifically because `NewRunPage` needs `useBlocker` (a data-router-only API).

- `DashboardPage` — today's summary, live runs, active machines
- `ProductionRunsPage` — all runs with filtering, split into in-progress/completed, XLSX export
- `RunDetailPage` — read-only for completed, completion form for in-progress
- `NewRunPage` — 5-step wizard (basic info → recipe → parameters → materials → output). **The run is created server-side after step 2, not at the end.** From step 3 onward a real `in_progress` row exists, which is why the page guards exit with `useBlocker` and `beforeunload`, and why Back out of step 2 is blocked once `runId` is set.
- `AdminPage` — navigation hub to management pages
- Management pages for: Operators, Machines, Products, Materials, Parameters, Recipes
- `MachineDetailPage` — per-machine setup (link/unlink parameters and products), routed at `/admin/machines/:machineId`
- `ProductDetailPage` — `/products/:productId`, shows recipes linked to a product and changes which is default
- `RecipeDetailPage` — `/recipes/:recipeId`, read-only material formula plus link/unlink products
- `NotFoundPage` — catch-all for `path="*"`

## Code Style Rules

### React / Frontend

- Style objects at the bottom of every component file, never inline styles
- **No CSS classes anywhere** — styling goes exclusively through the `style` attribute. Two or more consumers → put it in `client/src/styles/common.js`; single component → local `styles` object at the bottom of that file.
- Every `useEffect` uses an async `load()` function defined inside the effect
- `Promise.all` for multiple simultaneous API calls
- `console.error` in every catch block
- List pages use the shared `useApi` hook (`client/src/hooks/useApi.js`), which returns `{ data, loading, error, reload }`. Detail pages use a raw `useEffect` because their fetches depend on route params.

### Backend

- Partial updates use `...(field !== undefined && { field })` spread pattern in every PUT
- Input guards with `if (!field)` early returns before every Prisma call for required fields
- **Error handling rests on Express 5, which auto-forwards rejections from async handlers.** That is why no route has a blanket `try/catch` — an unhandled throw already reaches `middleware/errorHandler.js`. Catch only when you want to tag a friendlier message (`err.clientMessage`), then either `next(error)` or a bare `throw error`; both are correct and both are in use. Never add `console.error` to a route — only the middleware logs, and only for errors it does not recognize.
- Soft delete via `active: false` for operators, machines, and recipes
- Hard DELETE only for junction table links (MachineParameter, MachineProduct, RecipeProduct) and production runs
- **Units are a closed vocabulary**, not free text: `VALID_UNITS` in `server/lib/validation.js` is the source of truth, mirrored in `client/src/lib/units.js` and held in sync by a drift test that imports the server constant across the package boundary. Adding a unit means touching both sides. `Parameter.unit` is the deliberate exception — it stays free text and is never validated.
- No separate routes for nested models (RunParameterValue, MaterialUsage) — they are part of the ProductionRun lifecycle
- One output per run: `RunOutput` was dropped (2026-08-05) and `quantityProduced` lives on `ProductionRun` alongside its existing `productId`. Real usage never produced two products in one run, and two quantity fields for one physical quantity let the material math and the recorded output disagree. Don't re-introduce a per-run outputs collection.

### General

- Comments explain WHY, not WHAT. Code should be self-documenting.
- No unnecessary comments on obvious code.

## Git Workflow

- **Before making any changes:** Check if I have created a branch. If not, create a branch and switch to it before writing any code.
- **Branch naming:** `fix/` for bugs, `feature/` for new features, `chore/` for non-code changes
- **Commit convention:** `type: short description` in present tense (e.g., `fix: prevent negative stock on material usage`)
- **After changes are done:** Provide a commit message and a PR description (concise but more detailed than the commit message). The commit body should explain WHY the change was made — the diff already shows what.
- **Never mention `todo.md` in a commit message, a PR title, or a PR description.** No "closes todo.md Group 7 #18", no "as tracked in todo.md", no bare "#18". Those references *look* precise, but they are unresolvable to every audience that matters: a reviewer reading the PR on GitHub, me six months from now on a different machine, and any tool reading the history. The file is gitignored — it does not exist for anyone but me, on this machine, today.

  A commit message must stand on its own and state the actual problem in its own words. If the todo entry reads "Group 7 #18: export button fires twice on double click", the commit is `fix: prevent double-click from doubling export request burst`, and the body explains why double-firing was harmful. **The todo entry is where the work came from; it is not what the work was.**
- `.gitignore` and `CLAUDE.md` changes go directly on `main` — no branch needed.

## Architectural Decisions Already Made

These have been discussed and decided. Do not re-suggest or re-debate them:

- `MachineParameter` join table architecture is suboptimal for factory naming conventions but refactor cost outweighs benefit at current scale. Keeping as-is.
- Timezone: times stored in UTC, display conversion at UI layer, date filtering uses explicit UTC range boundaries on backend.
- No `select` optimization in Prisma queries — premature at current scale.
- No UUID-to-BigInt migration — irrelevant at current scale.
- No connection pooling — irrelevant at current scale.
- XLSX export uses SheetJS in the browser. The generated workbook is then reopened with JSZip and its worksheet XML edited by hand to control print layout — an `.xlsx` is a zip of XML files, and SheetJS does not expose those print settings.
- PDF export will use jsPDF + jspdf-autotable in the browser. **Not built yet** — neither package is installed.
- Export filename convention: `MachineName_DD.MM.YYYY-DD.MM.YYYY` (oldest to newest date in the filtered results), e.g. `Extruder_1_01.06.2026-30.06.2026.xlsx`.