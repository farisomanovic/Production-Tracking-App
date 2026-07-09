-- Move output weights up to the run level.
-- Order matters: add the new columns, copy the old data into them, and only
-- then drop the per-output columns — dropping first would lose the data.

-- 1. New run-level weight columns (nullable: old runs may have no data).
ALTER TABLE "ProductionRun"
    ADD COLUMN "netWeightPerUnit" DOUBLE PRECISION,
    ADD COLUMN "grossWeightPerUnit" DOUBLE PRECISION,
    ADD COLUMN "scrapKg" DOUBLE PRECISION;

-- 2. Data copy from the old per-output columns:
--    scrapKg            = total scrap across outputs (SUM of all-NULLs stays NULL)
--    grossWeightPerUnit = total gross / total quantity (old gross was a per-batch
--                         total; new bruto is per-unit). NULLIF guards qty = 0.
--    netWeightPerUnit stays NULL — it was never persisted before.
UPDATE "ProductionRun" pr
SET "scrapKg"            = agg.total_scrap,
    "grossWeightPerUnit" = agg.total_gross / NULLIF(agg.total_qty, 0)
FROM (
    SELECT ro."productionRunId"       AS run_id,
           SUM(ro."scrapKg")          AS total_scrap,
           SUM(ro."grossWeightKg")    AS total_gross,
           SUM(ro."quantityProduced") AS total_qty
    FROM "RunOutput" ro
    GROUP BY ro."productionRunId"
) agg
WHERE pr.id = agg.run_id;

-- 3. Drop the old per-output columns.
ALTER TABLE "RunOutput"
    DROP COLUMN "grossWeightKg",
    DROP COLUMN "scrapKg";
