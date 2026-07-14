-- Hand-written migration, same style as the stockQty CHECK constraint in
-- 20260708132617_completion_race_and_stock_floor: a partial unique index
-- (CREATE UNIQUE INDEX ... WHERE ...) is not expressible in Prisma schema
-- language, so schema.prisma is left untouched and this raw SQL is the only
-- place the constraint lives (see todo.md Group 8 #16 for the follow-up on
-- guarding against this becoming invisible to a future `prisma db pull`).
--
-- Closes the check-then-act race in POST /api/production-runs (todo.md Group
-- 5 #9): the busy-machine pre-check and the create() call are two separate,
-- non-atomic round-trips, so two near-simultaneous requests for the same
-- machine can both pass the check and both create an in_progress run. This
-- index makes "at most one in_progress run per machine" a DB-level guarantee
-- instead of an application-level convention — the second concurrent INSERT
-- fails with a unique violation (surfaced to Prisma as P2002), which the
-- route maps back to the same friendly message as the pre-check.
--
-- Verified before writing this migration: no machine currently has 2+
-- in_progress runs (2026-07-14) —
--   SELECT "machineId", COUNT(*) FROM "ProductionRun"
--   WHERE "status" = 'in_progress' GROUP BY "machineId" HAVING COUNT(*) > 1;
-- returned zero rows, so no data repair is needed before this index is added.
CREATE UNIQUE INDEX "ProductionRun_one_in_progress_per_machine"
ON "ProductionRun"("machineId")
WHERE "status" = 'in_progress';
