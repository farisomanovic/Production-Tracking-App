# PakOm Production Tracker

PakOm Production Tracker is a full-stack web application for logging and tracking daily production runs at a packaging materials firm. Built for PakOm d.o.o., a small manufacturer of PP strap and LDPE foil packaging materials, the app replaces manual paper-based logging with a structured digital workflow.

Each production run is fully traceable — who operated the machine, which machine and product were used, which recipe and materials were consumed, which machine parameters were recorded, and what output was produced. The application is designed to be simple enough for factory floor use while giving management a clear view of daily production activity.

## Tech Stack

- **Frontend:** React, Vite, React Router, Axios
- **Backend:** Node.js, Express, ES Modules
- **Database:** PostgreSQL
- **ORM:** Prisma
- **Development tooling:** Nodemon, ESLint

## Repository Structure

```text
production-tracker/
|-- client/                 # React + Vite frontend
|   |-- src/
|   |   |-- api/            # Axios API clients
|   |   |-- components/     # Shared UI and production-run wizard components
|   |   `-- pages/          # Route-level React pages
|   `-- package.json
|-- server/                 # Express + Prisma backend
|   |-- lib/prisma.js       # Shared Prisma client instance
|   |-- prisma/schema.prisma
|   |-- routes/             # Modular Express routers
|   `-- package.json
`-- README.md
```

## Database Schema Overview

The database is modeled around `ProductionRun`, the transactional record that ties the rest of the system together.

- **Operators** represent the people responsible for production runs. Operators use UUID primary keys and include an `active` field for soft deletion.
- **Machines** represent production equipment. Machines also use UUID primary keys and include an `active` field so historical runs remain linked even when a machine is no longer available for new work.
- **Parameters** define reusable machine setup or measurement fields, such as temperature, pressure, speed, or other process-specific values.
- **MachineParameter** links machines to parameters. This join model supports machine-specific parameter configuration and includes `displayOrder`, which controls the order parameters appear in the run form.
- **Products** represent the items being manufactured. Products can be linked to machines through `MachineProduct`, allowing the application to define which products each machine can produce.
- **Recipes** define the planned material composition for a product. Each recipe contains one or more `RecipeItem` records that link materials to planned percentages and quantities.
- **Materials** track input materials, units, suppliers, and stock quantities. During run completion, actual usage is captured in `MaterialUsage`.
- **ProductionRun** links one operator, machine, product, and recipe. It stores timing, energy, notes, buyer information, status, recorded parameter values, material usage, and output.

All main entities use Prisma-generated UUIDs (`@default(uuid())`) as primary keys. Soft deletion is implemented through the `active` Boolean field on `Operator` and `Machine`, preserving historical relationships while allowing inactive records to be excluded from operational workflows.

## API Architecture

The backend uses Express with ES Modules and a modular routing structure. Each domain area is implemented as its own Express Router under `server/routes`, then mounted from `server/index.js`.

All application API routes are exposed under the `/api` prefix:

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

The frontend API client is configured with Axios in `client/src/api/axiosInstance.js` and targets:

```text
http://localhost:3000/api
```

The backend also exposes a simple health check endpoint:

```text
GET /ping
```

## Key Features

- **Production run tracking:** Start and complete production runs with operator, machine, product, recipe, timing, energy, parameter, material, and output data.
- **Run status workflow:** New production runs default to `in_progress`; completing a run updates the status to `completed`.
- **Machine-specific parameters:** Parameters are reusable globally but assigned per machine through `MachineParameter`.
- **Drag-and-drop parameter ordering:** Machine parameter order is persisted with the `displayOrder` field and returned in ascending order for form rendering.
- **Recipe and material usage management:** Recipes define planned material composition, while completed runs capture actual material usage.
- **Material stock adjustment:** Completing a production run records material usage and decrements material stock quantities.
- **Soft deletion:** Operators and machines can be deactivated through the `active` field without breaking historical production records.
- **Relational traceability:** Production runs include linked operator, machine, product, recipe, parameter values, material usage, and output records.

## Getting Started

### Prerequisites

- Node.js
- npm
- PostgreSQL

### 1. Install Dependencies

Install backend dependencies:

```bash
cd server
npm install
```

Install frontend dependencies:

```bash
cd ../client
npm install
```

### 2. Configure Environment Variables

Create `server/.env` and define `DATABASE_URL` for your PostgreSQL database:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public"
```

Example for a local database:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/production_tracker?schema=public"
```

### 3. Generate the Prisma Client

From the `server` directory, generate the Prisma client:

```bash
npx prisma generate
```

If you are setting up a new local database, apply the existing Prisma migrations:

```bash
npx prisma migrate dev
```

### 4. Start the Backend

From the `server` directory:

```bash
npm run dev
```

The API server runs at:

```text
http://localhost:3000
```

### 5. Start the Frontend

In a separate terminal, from the `client` directory:

```bash
npm run dev
```

Vite will print the local frontend URL, typically:

```text
http://localhost:5173
```

## Development Notes

- Keep route handlers grouped by domain in `server/routes`.
- Use the shared Prisma client from `server/lib/prisma.js` for database access.
- Preserve UUID relationships when changing schema models or route behavior.
- Use `active: false` for machine/operator removal workflows instead of deleting records that may be referenced by historical production runs.
- When adding machine parameters, maintain unique `machineId`/`parameterId` and `machineId`/`displayOrder` combinations.
- Production run completion is transactional: run status, parameter values, material usage, stock updates, and outputs are saved together.
