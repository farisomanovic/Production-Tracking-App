-- Hand-written migration, same style as 20260714120000_production_run_one_in_progress_per_machine.
--
-- Recipe formulas are often reused across several products (e.g. different
-- widths of the same mix), but Recipe.productId was a required 1:1 foreign
-- key, so the only way to reuse a formula today is duplicating the whole
-- Recipe row per product (todo.md Group 5 #10, flagged directly by the
-- project owner from real recipe-reuse pain).
--
-- Postgres DDL is transactional, so this migration is all-or-nothing:
--   1. Create RecipeProduct, a join table mirroring the existing
--      MachineProduct pattern (Machine <-> Product), unique on
--      (recipeId, productId).
--   2. Backfill: every existing Recipe's current productId becomes its
--      first linked product in RecipeProduct. gen_random_uuid() is used for
--      the new rows' ids — confirmed available natively on this database
--      (Postgres 18, built into core since PG 16, no extension required).
--   3. Drop the old Recipe_productId_fkey constraint and the productId
--      column — Recipe -> Product is now expressed only through
--      RecipeProduct.
--
-- Verified before writing this migration (2026-07-17): row counts to sanity
-- check after backfill, before the column drop —
--   SELECT COUNT(*) FROM "Recipe";
--   SELECT COUNT(*) FROM "RecipeProduct";
-- (both counts must match — every existing recipe had exactly one productId
-- to backfill, so this is a 1:1 backfill, not a fan-out.)

-- 1. Create RecipeProduct
CREATE TABLE "RecipeProduct" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "RecipeProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecipeProduct_recipeId_productId_key" ON "RecipeProduct"("recipeId", "productId");

ALTER TABLE "RecipeProduct" ADD CONSTRAINT "RecipeProduct_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RecipeProduct" ADD CONSTRAINT "RecipeProduct_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 2. Backfill: one RecipeProduct row per existing Recipe, from its current productId
INSERT INTO "RecipeProduct" ("id", "recipeId", "productId")
SELECT gen_random_uuid()::text, "id", "productId" FROM "Recipe";

-- 3. Drop the old 1:1 relation
ALTER TABLE "Recipe" DROP CONSTRAINT "Recipe_productId_fkey";
ALTER TABLE "Recipe" DROP COLUMN "productId";
