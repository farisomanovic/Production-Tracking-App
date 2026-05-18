-- Normalizes ProductionRun date storage for PostgreSQL.
-- Keeps calendar dates independent from timestamp time-zone conversion.
-- Supports reliable filtering by production date in the API.

-- AlterTable
ALTER TABLE "ProductionRun" ALTER COLUMN "date" SET DATA TYPE DATE;
