/**
 * @file recipes.js
 * @description Routes for Recipe headers and their RecipeItem composition rows
 * (a product's material formula in percentages). Creation validates the formula;
 * material master data and stock do NOT belong here — see materials.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// ─── READS ───────────────────────────────────────────────────────────────────

/**
 * Lists every recipe with its linked products and full material breakdown.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Recipe[] (with products.product + recipeItems.material) sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipes
 * // → 200 [{ id: "d1e2…", name: "Standard mix",
 * //          products: [{ id: "f0a1…", isDefault: true, product: { name: "PP traka 12mm" } }],
 * //          recipeItems: [{ percentage: 70, material: { name: "PP granulat" } }] }]
 */
router.get('/', async (req, res) => {
    const recipes = await prisma.recipe.findMany({
        orderBy: { name: 'asc' },
        include: {
            products: {
                include: { product: true }
            },
            recipeItems: {
                include: {
                    material: true
                }
            }
        }
    })
    res.json(recipes)
})

/**
 * Lists the active recipes linked to one product — this is what the wizard's
 * Step 2 uses, so a recipe not linked to this product, or deactivated, can
 * never even be offered.
 *
 * @param {import('express').Request} req - `params.productId` is the product UUID.
 * @param {import('express').Response} res - 200 → active Recipe[] (possibly empty) with relations; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipes/by-product/c771…
 * // → 200 [{ id: "d1e2…", name: "Standard mix", isDefault: true, … }]
 */
router.get('/by-product/:productId', async (req, res) => {
    const { productId } = req.params

    // Hardcoded active-only filter, not a ?active= query param — this is a
    // narrow, purpose-built endpoint (the wizard's only consumer), matching
    // how this codebase favors that over generic query flags.
    const recipes = await prisma.recipe.findMany({
        where: { products: { some: { productId } }, active: true },
        orderBy: { name: 'asc' },
        include: {
            // Scoped to just this product's link — the where clause above
            // guarantees exactly one match per recipe — so isDefault can be
            // flattened onto the recipe below as "default FOR THIS PRODUCT".
            products: { where: { productId } },
            recipeItems: {
                include: { material: true }
            }
        }
    })
    // isDefault now lives on RecipeProduct (per-product), not Recipe — flatten
    // this product's link's isDefault back onto the recipe object so callers
    // (the wizard) don't need to know the shape changed. Never reuse this
    // flattened value outside a by-product context; it is meaningless there.
    const flattened = recipes.map(({ products, ...recipe }) => ({
        ...recipe,
        isDefault: products[0]?.isDefault ?? false
    }))
    res.json(flattened)
})

/**
 * Fetches one recipe aggregate by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the recipe UUID.
 * @param {import('express').Response} res - 200 → Recipe with relations; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipes/d1e2…
 * // → 200 { id: "d1e2…", name: "Standard mix", products: [ … ], recipeItems: [ … ] }
 */
router.get('/:id', async (req, res) => {
    const recipe = await prisma.recipe.findUnique({
        where: { id: req.params.id },
        include: {
            products: {
                include: { product: true }
            },
            recipeItems: {
                include: {
                    material: true
                }
            }
        }
    })
    if (!recipe) {
        return res.status(404).json({ error: 'Recipe not found' })
    }
    res.json(recipe)
})

// ─── WRITES ──────────────────────────────────────────────────────────────────

/**
 * Creates a recipe and all of its items in one nested write, after validating
 * that the formula is complete (items exist and percentages total 100).
 *
 * @param {import('express').Request} req - `body.name`, `body.productIds[]`, `body.items[]`
 * ({ materialId, percentage, plannedQtyKg? }) required; `productIds` must be a non-empty array
 * of product UUIDs (a recipe must always be linked to at least one product); each item needs
 * a unique, non-empty `materialId`, a `percentage` in (0, 100], and — if present — a positive
 * `plannedQtyKg`. `body.notes` optional. A new recipe's links always start with
 * isDefault:false — set a link's default via PUT /recipe-products/:id after creation.
 * @param {import('express').Response} res - 201 → created Recipe aggregate; 400 invalid formula or bad reference; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/recipes
 * // { "name": "Regranulat mix", "productIds": ["c771…"],
 * //   "items": [{ "materialId": "a9d2…", "percentage": 60 },
 * //             { "materialId": "77b0…", "percentage": 40 }] }
 * // → 201 { id: "4fe1…", name: "Regranulat mix", products: [ …1 link ], recipeItems: [ …2 items ] }
 */
router.post('/', async (req, res) => {
    const { name, productIds, notes, items } = req.body

    if (!name || !productIds || !Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({ error: 'name and at least one productId are required' })
    }
    if (new Set(productIds).size !== productIds.length) {
        return res.status(400).json({ error: 'Each product can only be linked once' })
    }

    // A recipe with no items would let a run start with nothing to consume —
    // material usage and the Step 4 calculator both assume at least one row.
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'At least one recipe item is required' })
    }

    const seenMaterialIds = new Set()
    for (const item of items) {
        if (!item.materialId) {
            return res.status(400).json({ error: 'Each recipe item needs a materialId' })
        }
        if (seenMaterialIds.has(item.materialId)) {
            return res.status(400).json({ error: 'Each material can only appear once in a recipe' })
        }
        seenMaterialIds.add(item.materialId)

        if (!(typeof item.percentage === 'number' && item.percentage > 0 && item.percentage <= 100)) {
            return res.status(400).json({ error: 'Each recipe item needs a percentage greater than 0 and at most 100' })
        }

        if (item.plannedQtyKg !== undefined &&
            !(typeof item.plannedQtyKg === 'number' && Number.isFinite(item.plannedQtyKg) && item.plannedQtyKg > 0)) {
            return res.status(400).json({ error: 'plannedQtyKg must be a positive number when provided' })
        }
    }
    const total = items.reduce((sum, item) => sum + item.percentage, 0)
    if (Math.abs(total - 100) > 0.001) {
        return res.status(400).json({ error: `Recipe items must add up to 100%. Currently: ${total}%` })
    }

    const recipe = await prisma.recipe.create({
        data: {
            name,
            ...(notes !== undefined && { notes }),
            products: {
                // Nested create instead of separate inserts: Prisma wraps the
                // header + links + items in one implicit transaction, so a
                // failed item or link can never leave behind a half-formed recipe.
                create: productIds.map(productId => ({ productId }))
            },
            recipeItems: {
                create: items.map(item => ({
                    materialId: item.materialId,
                    percentage: item.percentage,
                    ...(item.plannedQtyKg !== undefined && { plannedQtyKg: item.plannedQtyKg })
                }))
            }
        },
        include: {
            products: {
                include: { product: true }
            },
            recipeItems: {
                include: {
                    material: true
                }
            }
        }
    })
    res.status(201).json(recipe)
})

/**
 * Updates recipe metadata, and also doubles as the soft-delete toggle via
 * `active` — mirroring PUT /operators/:id and PUT /machines/:id, no dedicated
 * activate/deactivate endpoint exists (todo.md Group 3 #13). Items are
 * deliberately untouchable here — changing composition would require
 * re-validating the 100% total, and no item-editing endpoint exists yet.
 * isDefault is not settable here at all — it lives on RecipeProduct now (one
 * flag per linked product), so use PUT /recipe-products/:id instead.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.notes`, `body.active`.
 * @param {import('express').Response} res - 200 → updated Recipe aggregate; 404 unknown id; 409 blocked by in-progress run; 500 on failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/recipes/d1e2…  { "active": false }
 * // → 200 { id: "d1e2…", name: "Standard mix", active: false, … }
 */
router.put('/:id', async (req, res) => {
    const { name, notes, active } = req.body
    if (active === false) {
        const openRun = await prisma.productionRun.findFirst({
            where: { recipeId: req.params.id, status: 'in_progress' },
            select: { id: true }
        })
        if (openRun) {
            return res.status(409).json({ error: 'Cannot deactivate this recipe while a run is in progress' })
        }
    }
    const recipe = await prisma.recipe.update({
        where: { id: req.params.id },
        data: {
            ...(name !== undefined && { name }),
            ...(notes !== undefined && { notes }),
            ...(active !== undefined && { active }),
        },
        include: {
            products: {
                include: { product: true }
            },
            recipeItems: {
                include: {
                    material: true
                }
            }
        }
    })
    res.json(recipe)
})

export default router
