-- Run children cascade with their run (replaces manual deleteMany in the DELETE
-- route), and Material.stockQty gets a hard floor at zero: the CHECK constraint
-- is the database-level guarantee behind the application-level conditional
-- decrement in POST /production-runs/:id/complete.

-- DropForeignKey
ALTER TABLE "MaterialUsage" DROP CONSTRAINT "MaterialUsage_productionRunId_fkey";

-- DropForeignKey
ALTER TABLE "RunOutput" DROP CONSTRAINT "RunOutput_productionRunId_fkey";

-- DropForeignKey
ALTER TABLE "RunParameterValue" DROP CONSTRAINT "RunParameterValue_productionRunId_fkey";

-- AddForeignKey
ALTER TABLE "RunParameterValue" ADD CONSTRAINT "RunParameterValue_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaterialUsage" ADD CONSTRAINT "MaterialUsage_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunOutput" ADD CONSTRAINT "RunOutput_productionRunId_fkey" FOREIGN KEY ("productionRunId") REFERENCES "ProductionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma's schema language cannot express CHECK constraints, so this part is
-- hand-written. The clamp handles environments where stock already went negative
-- under the old code (verified absent in the primary database on 2026-07-08);
-- without it, ADD CONSTRAINT would fail on the first offending row.
UPDATE "Material" SET "stockQty" = 0 WHERE "stockQty" < 0;
ALTER TABLE "Material" ADD CONSTRAINT "Material_stockQty_nonnegative" CHECK ("stockQty" >= 0);
