# PakOm Production Tracker

A full-stack shop-floor tracking app for PakOm d.o.o., a manufacturer of PP strapping and LDPE foil. It replaces paper production logs with a digital workflow: start a run, record machine parameters and material usage, log outputs, and export finished runs to Excel for reporting.

Every production run links an operator, machine, product, and recipe together with the measurements, materials, and outputs recorded during that run — the goal is full traceability from raw material to finished product.

## Repository Layout

```text
production-tracker/
|-- client/                    # React 19 + Vite frontend
|   |-- src/
|   |   |-- api/                # One Axios wrapper file per backend resource
|   |   |-- components/
|   |   |   |-- wizard/         # 5-step "New Run" creation flow
|   |   |   `-- BottomNav.jsx   # Persistent bottom nav + light/dark theme toggle
|   |   |-- hooks/useApi.js     # Shared fetch/loading/error hook used by list pages
|   |   |-- pages/              # One page per route (dashboard, admin, run detail, etc.)
|   |   |-- styles/common.js    # Shared style objects
|   |   |-- App.jsx             # Route table
|   |   `-- main.jsx            # React entry point
|   `-- package.json
|-- server/                    # Node.js + Express + Prisma backend
|   |-- index.js                # Express app, middleware, router mounts
|   |-- lib/prisma.js           # Shared PrismaClient instance
|   |-- prisma/
|   |   |-- schema.prisma       # Data model
|   |   `-- migrations/         # Migration history
|   `-- routes/                 # One Express router per resource
|-- todo.md                    # Known bugs / tech debt, ranked by severity
|-- knowledge-gaps.md          # Personal study notes (concepts I got wrong + corrections)
`-- README.md
```

## Architecture

```text
React page -> Axios helper (client/src/api) -> Express router (server/routes) -> Prisma -> PostgreSQL
```

- **Pages** (`client/src/pages`) own screen state and call functions from `client/src/api`. Several list pages (Operators, Machines, Products, Materials, Parameters) share the `useApi` hook (`client/src/hooks/useApi.js`), which handles fetch/loading/error state and exposes a `reload()` callback — this was extracted to remove duplicated fetch boilerplate across those pages.
- **New Run wizard** (`client/src/components/wizard`) is a 5-step flow: `Step1_BasicInfo` -> `Step2_Recipe` -> `Step3_Parameters` -> `Step4_Materials` -> `Step5_Output`. Step 4 includes a calculator that derives material quantities from the recipe's percentages and the produced quantity, instead of requiring manual math.
- **Run detail / completion** (`client/src/pages/RunDetailPage.jsx`) shows a completed run's full record, or — if the run is still `in_progress` — renders a completion form (parameters, materials, outputs) so a run can be finished outside the original wizard session.
- **Express routers** (`server/routes`) validate input and talk to PostgreSQL exclusively through the shared Prisma client in `server/lib/prisma.js`.
- **Excel export** (`client/src/pages/ProductionRunsPage.jsx`) builds an `.xlsx` report of completed runs for a selected machine/date range using `xlsx` + `jszip`, entirely client-side.

## Backend API

Base URL: `http://localhost:3000`

```text
GET  /ping                       health check

/api/operators
/api/machines
/api/products
/api/materials
/api/parameters
/api/machine-parameters          links a machine + parameter, sets form displayOrder
/api/machine-products            links a machine + product it's allowed to run
/api/recipes                     recipe + recipe items (material % composition)
/api/production-runs             GET (list, filterable), GET /:id, POST, PUT /:id
/api/production-runs/:id/complete   POST — completes a run in one transaction
/api/production-runs/:id            DELETE — removes a run and reverses stock usage
```

`GET /api/production-runs` accepts `machineId`, `operatorId`, `productId`, `status`, `dateFrom`, `dateTo`, and `limit` query params.

## Data Model

Defined in `server/prisma/schema.prisma`.

| Model | Purpose |
|---|---|
| `Operator`, `Machine` | Master data for staff and equipment. Soft-deleted via `active: false` so history stays intact. |
| `Product` | Manufactured item (unique `code`, dimensions, unit). |
| `Material` | Raw input with `stockQty`, decremented on run completion. |
| `Parameter` | A reusable measurement type (speed, temp, pressure, ...). |
| `MachineParameter` | Which parameters a machine collects, and in what order (`displayOrder`). |
| `MachineProduct` | Which products a machine is allowed to produce. |
| `Recipe` / `RecipeItem` | A product's material formula (percentages should total 100). |
| `ProductionRun` | The transactional record: operator, machine, product, recipe, timing, energy, status (`in_progress` -> `completed`), notes, buyer. |
| `RunParameterValue`, `MaterialUsage`, `RunOutput` | Per-run measurements, material consumption, and produced quantities. |

## Key Behaviors

- **Two-step run lifecycle:** a run is created (`in_progress`) with header info, then completed later with measurements, material usage, and outputs. Completion runs inside a single Prisma transaction that updates status, records usage, decrements material stock, and creates output rows together.
- **Deleting a completed run** restores the material stock it had consumed and removes its dependent records, transactionally.
- **Soft deletion:** operators and machines are never hard-deleted, only flagged `active: false`, so old runs keep valid references.
- **Recipe validation:** recipe items must sum to 100% before a recipe can be saved.
- **Theme:** light/dark mode is toggled from the bottom nav and persisted to `localStorage`.

## Known Limitations

This is a student project under active development — several things are intentionally not production-hardened yet (no auth, open CORS, no stock floor check, etc). See [`todo.md`](./todo.md) for the full, prioritized list of known issues and the order they're planned to be tackled in.

## Setup

### Prerequisites

- Node.js
- npm
- PostgreSQL

### 1. Backend

```bash
cd server
npm install
```

Create `server/.env`:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/production_tracker?schema=public"
```

Generate the Prisma client and apply migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

Start the API (runs on `http://localhost:3000`):

```bash
npm run dev
```

### 2. Frontend

In a separate terminal:

```bash
cd client
npm install
npm run dev
```

Vite prints the local URL, typically `http://localhost:5173`.

## Development Commands

**Backend** (`server/`): `npm run dev` (nodemon), `npm start`, `npx prisma generate`, `npx prisma migrate dev`

**Frontend** (`client/`): `npm run dev`, `npm run lint`, `npm run build`, `npm run preview`

## Conventions

- No CSS classes anywhere — every element is styled via the `style` attribute, sourced either from shared objects in `client/src/styles/common.js` or from a local `styles` object defined at the bottom of the component file.
- Every `useEffect` that fetches data defines an async `load()` function inside the effect.
- `Promise.all` for independent simultaneous fetches.
- Every `catch` block logs with `console.error`.
- Commits follow Conventional Commits (`type: short description`, present tense); branches use `fix/...` or `feature/...`.
