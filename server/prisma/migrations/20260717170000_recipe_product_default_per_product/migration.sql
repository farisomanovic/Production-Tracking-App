-- Hand-written migration, same style as
-- 20260714120000_production_run_one_in_progress_per_machine and
-- 20260717150000_recipe_product_many_to_many.
--
-- Moves "default recipe" from a single unscoped flag on Recipe to a
-- per-(recipe,product) flag on RecipeProduct (todo.md Group 5 #6). Recipe
-- gained a many-to-many relation to Product in 20260717150000 but
-- Recipe.isDefault was never rescoped afterwards: today one flag on a Recipe
-- row is simultaneously "the default" for every product that recipe happens
-- to be linked to, and nothing stops two+ recipes linked to the SAME product
-- from both being flagged true.
--
-- Postgres DDL is transactional, so this migration is all-or-nothing:
--   1. Add RecipeProduct.isDefault, defaulting every existing link to false.
--   2. Backfill: a link becomes the default only if its OWN recipe was
--      isDefault=true AND active=true. An inactive recipe's stale flag is
--      deliberately NOT carried over — GET /recipes/by-product/:id
--      (recipes.js) already hardcodes active:true, so an inactive recipe's
--      isDefault has never actually been surfaced as "the" default in
--      practice; backfilling it away is not a behavior change.
--   3. Add the partial unique index: at most one isDefault=true row per
--      productId. Not expressible in schema.prisma (no partial-index
--      syntax) — same as ProductionRun_one_in_progress_per_machine, this
--      raw SQL file is the only place the constraint lives. See todo.md
--      Group 8 #16 for guarding raw-SQL-only constraints against silent
--      loss via a future `prisma db pull`.
--   4. Drop Recipe.isDefault — fully superseded by RecipeProduct.isDefault.
--
-- Verified before writing this migration (2026-07-17):
--   SELECT COUNT(*) FROM "Recipe" WHERE "isDefault" = true;                     -- 8
--   SELECT COUNT(*) FROM "Recipe" WHERE "isDefault" = true AND "active" = true; -- 0
--   SELECT rp."productId", COUNT(*) FROM "RecipeProduct" rp
--     JOIN "Recipe" r ON r.id = rp."recipeId"
--     WHERE r."isDefault" = true AND r."active" = true
--     GROUP BY rp."productId" HAVING COUNT(*) > 1;                              -- 0 rows
-- All 8 flagged rows are on inactive recipes, so the backfill below produces
-- zero isDefault=true rows today — no product can violate the partial unique
-- index at step 3, and no manual data repair is needed first.

ALTER TABLE "RecipeProduct" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "RecipeProduct" rp
SET "isDefault" = true
FROM "Recipe" r
WHERE r.id = rp."recipeId" AND r."isDefault" = true AND r."active" = true;

CREATE UNIQUE INDEX "RecipeProduct_one_default_per_product"
ON "RecipeProduct"("productId")
WHERE "isDefault" = true;

ALTER TABLE "Recipe" DROP COLUMN "isDefault";
