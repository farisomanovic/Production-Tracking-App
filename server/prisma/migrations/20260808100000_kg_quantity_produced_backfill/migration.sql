-- Rewrites four ProductionRun.quantityProduced values from a roll count into
-- the kilograms they always represented, so the column means one thing on a
-- kg-unit product (todo.md Group 7 #42).
--
-- WHY THESE ROWS HOLD A COUNT AT ALL
--
-- Until PR #95 the Step 4 material calculator computed total raw material as
-- `quantity x neto + scrap` for every product, including products whose unit
-- is already kg. Operators compensated by typing a ROLL COUNT into the
-- kg-labelled quantity field, because that is what made the multiply come out
-- right. PR #95 removed the multiply for kg products, so every kg run from
-- 2026-08-07 onward stores real kilograms. The column therefore holds two
-- different physical quantities with nothing marking which.
--
-- HOW THE FOUR WERE IDENTIFIED (read-only audit, 2026-08-07)
--
--   SELECT r.id, r."quantityProduced" qty, r."netWeightPerUnit" neto, r."scrapKg" scrap,
--          (SELECT SUM(mu."quantityUsed") FROM "MaterialUsage" mu
--            WHERE mu."productionRunId" = r.id) used
--     FROM "ProductionRun" r JOIN "Product" p ON p.id = r."productId"
--    WHERE p.unit = 'kg' ORDER BY r.date;
--
--   id        date        qty   neto    scrap  used     qty*neto+scrap
--   98f9268c  2026-06-05  255   NULL    10     255      --
--   a2ba243c  2026-07-13    2   23.85   6.2    53.9     53.9    <- count
--   c6762804  2026-07-13   10   23.96   1      240.6    240.6   <- count
--   f3e9d389  2026-07-20    5   22.85   7      121.26   121.25  <- count
--   6ee9b1dd  2026-07-22   10   24.7    7      254      254     <- count
--
-- A row entered the old way satisfies `used = qty * neto + scrap`; one entered
-- the new way satisfies `used = qty + scrap`. Four rows match the first to the
-- cent (f3e9d389 differs by 0.01, which is the calculator's own toFixed(2)
-- rounding). 98f9268c matches neither -- its material amount was hand-entered --
-- but 255 rolls of foil with no neto recorded is not a plausible reading, so it
-- is already kilograms and is NOT touched here.
--
-- The new value is `qty * neto` in every case: the kilograms those rolls weighed.
--
-- WHAT THIS DOES NOT TOUCH, AND WHY THAT MATTERS
--
-- MaterialUsage.quantityUsed and Material.stockQty are CORRECT on all five runs
-- and are not written here. The operators' compensation made the old arithmetic
-- produce the right consumption figure, so no stock number is wrong and none
-- moves. This migration writes one nullable Float column that no transaction,
-- constraint or stock path reads -- quantityProduced is read only by the XLSX
-- export and two display cards.
--
-- Idempotent by construction: each statement is pinned to one primary key AND
-- guarded on the value it expects to find, so a re-run matches nothing rather
-- than compounding. Ids rather than a predicate on purpose -- a predicate could
-- match a row nobody inspected. Rollback is the reverse UPDATE with the old
-- values above; nothing structural changes here.
UPDATE "ProductionRun" SET "quantityProduced" = 47.7
 WHERE id = 'a2ba243c-c22d-4a0b-8545-989c783bf095' AND "quantityProduced" = 2;

UPDATE "ProductionRun" SET "quantityProduced" = 239.6
 WHERE id = 'c6762804-237a-471f-a1e1-7f8463ff5189' AND "quantityProduced" = 10;

UPDATE "ProductionRun" SET "quantityProduced" = 114.25
 WHERE id = 'f3e9d389-13eb-49d0-895b-aeccc985117f' AND "quantityProduced" = 5;

UPDATE "ProductionRun" SET "quantityProduced" = 247
 WHERE id = '6ee9b1dd-aff0-43aa-b929-a0f0b193dfc9' AND "quantityProduced" = 10;
