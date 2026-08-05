-- Fixes the CHECK added minutes earlier in 20260805120000_single_output_per_run,
-- which did not actually constrain anything in the one case it was written for.
--
-- The original expression was:
--   ("quantityProduced" IS NULL AND "status" <> 'completed') OR "quantityProduced" > 0
-- For a completed run with a NULL quantity, the left branch is FALSE and the
-- right branch is `NULL > 0`, which in SQL's three-valued logic is NULL, not
-- FALSE. FALSE OR NULL is NULL — and Postgres treats a CHECK that evaluates to
-- NULL as satisfied, not violated. So the constraint accepted exactly the row
-- it was meant to reject. Caught by the regression test written alongside it
-- (productionRuns.complete.test.js), which is the whole reason that test exists.
--
-- The fix is to make the NULL case explicit instead of letting a comparison
-- against NULL decide: every branch below now evaluates to a real TRUE/FALSE.
--   NULL   + in_progress → TRUE  (a run that has not finished yet)
--   NULL   + completed   → FALSE (the case that used to slip through)
--   0 or - + either      → FALSE
--   > 0    + either      → TRUE
ALTER TABLE "ProductionRun" DROP CONSTRAINT "ProductionRun_quantityProduced_valid";

ALTER TABLE "ProductionRun" ADD CONSTRAINT "ProductionRun_quantityProduced_valid"
CHECK (
    ("quantityProduced" IS NULL AND "status" <> 'completed')
    OR ("quantityProduced" IS NOT NULL AND "quantityProduced" > 0)
);
