-- Case-insensitive uniqueness layered on top of the existing case-sensitive
-- unique index (Material_name_key / Parameter_name_key, added in
-- 20260717180000_unique_material_parameter_names). Prisma's schema language
-- cannot express a functional/expression index, so — same reasoning as the
-- stockQty CHECK in 20260708132617_completion_race_and_stock_floor — this
-- lives in raw SQL only; the plain @unique in schema.prisma is KEPT
-- (not replaced) so Prisma's own migration history and introspection stay
-- accurate for the case-sensitive half of the constraint.
--
-- Deliberately does NOT touch existing whitespace-only-divergent rows (e.g.
-- "Brzina Druge Motalice" vs "Brzina Druge Motalice ") — lower() does not
-- trim, so that known pair does not collide here and this migration applies
-- cleanly regardless. Merging that pair (and repointing its
-- RunParameterValue references) is a separate, deliberately deferred task —
-- see todo.md Group 3 #21.
CREATE UNIQUE INDEX "Material_name_lower_key" ON "Material" (lower(name));
CREATE UNIQUE INDEX "Parameter_name_lower_key" ON "Parameter" (lower(name));
