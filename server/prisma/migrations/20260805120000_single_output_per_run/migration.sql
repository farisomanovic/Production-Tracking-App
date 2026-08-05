-- Collapses the one-run-to-many-RunOutput design down to a single produced
-- quantity on the run itself (todo.md Group 5 #11). ProductionRun already
-- carries productId — validated against MachineProduct at creation and
-- immutable afterwards — so RunOutput's own productId was a second, weaker
-- answer to "what was made"; only the quantity needed a new home.
--
-- Hand-written rather than left as `prisma migrate dev` generated it: the
-- generated version drops the table without moving the data out of it first,
-- and the CHECK below is not expressible in Prisma schema language at all
-- (same situation as Material_stockQty_nonnegative in
-- 20260708132617_completion_race_and_stock_floor).
--
-- Measured in the primary database on 2026-08-05, before writing this:
--   48 production runs, all completed, all with at least one RunOutput row;
--   exactly ONE run (c2672b70-d8ad-4113-8a9c-a51152dacec8, dated 2025-06-08)
--   has more than one output row, and it is also the only run whose output
--   product differs from its own productId.
-- The SUM backfill therefore reproduces every run's quantity exactly except
-- that single 2025 row, which becomes 2 pcs of its header product
-- (PP 12x0,65mm 2500m) and loses the separate PP 12x0,65mm 2000m line —
-- accepted deliberately by the project owner rather than silently.

-- AlterTable
-- Nullable because an in_progress run has not produced anything yet, the same
-- reasoning endTime and the weight columns already follow.
ALTER TABLE "ProductionRun" ADD COLUMN "quantityProduced" DOUBLE PRECISION;

-- Backfill BEFORE the drop, or the data is gone with the table.
UPDATE "ProductionRun" pr
SET "quantityProduced" = agg.total
FROM (
    SELECT "productionRunId", SUM("quantityProduced") AS total
    FROM "RunOutput"
    GROUP BY "productionRunId"
) agg
WHERE pr."id" = agg."productionRunId";

-- DropTable
-- Both foreign keys (to ProductionRun and to Product) belong to this table and
-- go with it.
DROP TABLE "RunOutput";

-- The database-level guarantee behind /complete's "quantityProduced must be a
-- number greater than 0" check: a run may only lack a quantity while it is
-- still unfinished, and a completed run's quantity is always positive. Because
-- ADD CONSTRAINT validates every existing row, a completed run that somehow had
-- no output rows would abort this migration here instead of surviving as a
-- silently quantity-less record — none exist as of the count above.
ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_quantityProduced_valid"
CHECK (
    ("quantityProduced" IS NULL AND "status" <> 'completed')
    OR "quantityProduced" > 0
);
