-- Hand-written migration, same style as 20260717150000_recipe_product_many_to_many.
--
-- Recipe gains the same soft-delete `active` flag Operator and Machine already
-- have (schema.prisma init migration): a discontinued formula can be hidden
-- from new-run selection without breaking the required FK on
-- ProductionRun.recipeId that every historical run depends on.
--
-- DEFAULT true backfills every existing row as active in the same statement —
-- no separate backfill step needed (unlike the RecipeProduct migration, which
-- had a real 1:1 relationship to carry over).

ALTER TABLE "Recipe" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
