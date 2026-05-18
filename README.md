# PakOm Production Tracker

PakOm Production Tracker is a full-stack production logging application for PP strap and LDPE foil manufacturing operations. It replaces paper-based shop-floor logs with a structured workflow for creating, completing, filtering, exporting, and reviewing production runs.

The system is designed around traceability. Each production run links the operator, machine, product, recipe, collected machine parameters, material consumption, output quantities, energy readings, timing data, and notes into one auditable record.

## Project Overview

The repository is split into two application boundaries:

```text
production-tracker/
|-- client/                 # React + Vite frontend
|   |-- public/             # Static browser assets
|   |-- src/
|   |   |-- api/            # Axios wrappers for Express endpoints
|   |   |-- components/     # Shared UI and production-run wizard steps
|   |   |-- pages/          # Route-level React screens
|   |   |-- App.jsx         # Browser route map
|   |   `-- main.jsx        # React mount point
|   `-- package.json
|-- server/                 # Node.js + Express + Prisma backend
|   |-- index.js            # API server entry point and router mounts
|   |-- lib/prisma.js       # Shared Prisma Client singleton
|   |-- prisma/             # Prisma schema and migration history
|   |-- routes/             # Domain-specific Express routers
|   `-- package.json
`-- README.md
```

The `client` folder owns the browser experience. It renders the production dashboard, admin screens, production-run list/detail pages, and multi-step run creation wizard. API access is centralized in `client/src/api`, where Axios helpers call the backend using the `/api` route prefix.

The `server` folder owns persistence and business transactions. Express routers validate incoming requests, call Prisma, and return JSON responses to the React client. Prisma maps JavaScript operations to PostgreSQL tables, relations, constraints, and migrations.

## Project Architecture

The runtime flow is:

```text
React UI -> Axios API helper -> Express route -> Prisma Client -> PostgreSQL
```

1. **React**
   Users interact with route-level pages in `client/src/pages` and wizard components in `client/src/components/wizard`.

2. **Axios**
   Client helpers in `client/src/api` call backend endpoints through the shared Axios instance in `axiosInstance.js`.

3. **Express API**
   `server/index.js` mounts domain routers under `/api`, including operators, machines, products, materials, recipes, machine parameters, machine products, and production runs.

4. **Prisma**
   Route handlers import the shared Prisma Client from `server/lib/prisma.js` and execute typed database operations.

5. **PostgreSQL**
   PostgreSQL stores master data, configuration links, and transactional production-run records. The schema is defined in `server/prisma/schema.prisma` and versioned through Prisma migrations.

## Backend API Areas

All application APIs are mounted under:

```text
http://localhost:3000/api
```

Primary route groups:

```text
/api/operators
/api/machines
/api/parameters
/api/products
/api/materials
/api/machine-parameters
/api/machine-products
/api/recipes
/api/production-runs
```

Health check:

```text
GET /ping
```

## Data Model Summary

The schema is centered on `ProductionRun`, the transactional record that connects factory activity to master data.

- `Operator` stores production staff. Operators use `active: boolean` for soft deletion so historical runs remain valid.
- `Machine` stores production equipment. Machines also use `active: boolean` to prevent deletion from breaking traceability.
- `Product` stores manufactured items and dimensional metadata.
- `Material` stores consumed input materials, suppliers, units, and stock quantities.
- `Parameter` stores reusable machine measurements, such as speed, temperature, pressure, or process-specific values.
- `MachineParameter` links machines to parameters and uses `displayOrder` to control form order in the UI.
- `MachineProduct` links machines to products that can be produced on that equipment.
- `Recipe` and `RecipeItem` define planned material composition for a product.
- `ProductionRun` records operator, machine, product, recipe, timing, energy, status, buyer, notes, parameter values, material usage, and outputs.

## Operational Rules

- **Soft deletion:** Operators and machines are deactivated with `active: false` instead of being deleted. This protects historical `ProductionRun` relationships while hiding inactive records from new-run workflows.
- **Display ordering:** Machine-specific parameters are ordered by `MachineParameter.displayOrder`. The wizard uses that order when collecting process measurements.
- **Run completion:** Completing a run updates status, records parameter values, records material usage, decrements stock, and creates output rows inside one Prisma transaction.
- **Run deletion:** Deleting a completed run restores material stock and removes dependent run records transactionally.
- **Recipe validation:** Recipe item percentages must total 100 before a recipe can be created.

## Setup

### Prerequisites

- Node.js
- npm
- PostgreSQL

### 1. Install Backend Dependencies

```bash
cd server
npm install
```

### 2. Configure Backend Environment

Create `server/.env` with a PostgreSQL connection string:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

Example local configuration:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/production_tracker?schema=public"
```

### 3. Generate Prisma Client

From the `server` directory:

```bash
npx prisma generate
```

For a new local database, apply migrations:

```bash
npx prisma migrate dev
```

### 4. Start Backend

From the `server` directory:

```bash
npm run dev
```

The backend runs at:

```text
http://localhost:3000
```

### 5. Install Frontend Dependencies

In a separate terminal:

```bash
cd client
npm install
```

### 6. Start Frontend

From the `client` directory:

```bash
npm run dev
```

Vite will print the local URL, typically:

```text
http://localhost:5173
```

## Development Commands

Backend:

```bash
cd server
npm run dev
npm start
npx prisma generate
npx prisma migrate dev
```

Frontend:

```bash
cd client
npm run dev
npm run lint
npm run build
npm run preview
```

## Engineering Notes

- Keep API access in `client/src/api` instead of calling Axios directly from pages.
- Keep backend database access through `server/lib/prisma.js`.
- Prefer soft deletion for operators and machines to preserve historical data integrity.
- Maintain `displayOrder` carefully when changing machine parameter workflows.
- Treat production-run completion as a transaction because it affects run state, measurements, material usage, inventory, and outputs.
- Avoid deleting master data that may be referenced by historical production runs.
