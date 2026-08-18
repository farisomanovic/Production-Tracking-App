-- Hand-written migration, same style as 20260717160000_recipe_active_flag.
--
-- Product, Material and Parameter gain the soft-delete `active` flag Operator,
-- Machine and Recipe already have. Every one of the three is reachable from
-- production history through a required foreign key — ProductionRun.productId
-- directly, Material through MaterialUsage.materialId, Parameter through
-- MachineParameter — so none of them can ever be row-deleted. Without a flag
-- there was no third option: a typo'd material was permanent and stayed in the
-- recipe builder's dropdown forever.
--
-- DEFAULT true backfills every existing row as active in the same statement, so
-- no separate backfill step is needed — same as the Recipe migration.
--
-- NOT NULL is safe to add here despite the existing rows precisely BECAUSE of
-- the DEFAULT: Postgres fills the new column for every row as part of the ALTER,
-- and since PG 11 does it without rewriting the table.

ALTER TABLE "Product" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Material" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Parameter" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;
