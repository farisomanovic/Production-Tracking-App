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
 * Lists every recipe with product and full material breakdown.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Recipe[] (with product + recipeItems.material) sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipes
 * // → 200 [{ id: "d1e2…", name: "Standard mix", isDefault: true,
 * //          product: { name: "PP traka 12mm" },
 * //          recipeItems: [{ percentage: 70, material: { name: "PP granulat" } }] }]
 */
router.get('/', async (req, res) => {
    const recipes = await prisma.recipe.findMany({
        orderBy: { name: 'asc' },
        include: {
            product: true,
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
 * Lists the recipes belonging to one product — this is what the wizard's
 * Step 2 uses, so a recipe for a different product can never even be offered.
 *
 * @param {import('express').Request} req - `params.productId` is the product UUID.
 * @param {import('express').Response} res - 200 → Recipe[] (possibly empty) with relations; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipes/by-product/c771…
 * // → 200 [{ id: "d1e2…", name: "Standard mix", isDefault: true, … }]
 */
router.get('/by-product/:productId', async (req, res) => {
    const { productId } = req.params

    const recipes = await prisma.recipe.findMany({
        where: { productId },
        orderBy: { name: 'asc' },
        include: {
            product: true,
            recipeItems: {
                include: { material: true }
            }
        }
    })
    res.json(recipes)
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
 * // → 200 { id: "d1e2…", name: "Standard mix", recipeItems: [ … ] }
 */
router.get('/:id', async (req, res) => {
    const recipe = await prisma.recipe.findUnique({
        where: { id: req.params.id },
        include: {
            product: true,
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
 * @param {import('express').Request} req - `body.name`, `body.productId`, `body.items[]`
 * ({ materialId, percentage, plannedQtyKg? }) required; each item needs a unique, non-empty
 * `materialId`, a `percentage` in (0, 100], and — if present — a positive `plannedQtyKg`.
 * `body.isDefault`, `body.notes` optional.
 * @param {import('express').Response} res - 201 → created Recipe aggregate; 400 invalid formula or bad reference; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/recipes
 * // { "name": "Regranulat mix", "productId": "c771…",
 * //   "items": [{ "materialId": "a9d2…", "percentage": 60 },
 * //             { "materialId": "77b0…", "percentage": 40 }] }
 * // → 201 { id: "4fe1…", name: "Regranulat mix", recipeItems: [ …2 items ] }
 */
router.post('/', async (req, res) => {
    const { name, productId, isDefault, notes, items } = req.body

    if (!name || !productId) {
        return res.status(400).json({ error: 'name and productId are required' })
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
            productId,
            ...(isDefault !== undefined && { isDefault }),
            ...(notes !== undefined && { notes }),
            recipeItems: {
                // Nested create instead of separate inserts: Prisma wraps the
                // header + items in one implicit transaction, so a failed item
                // can never leave behind a recipe with half a formula.
                create: items.map(item => ({
                    materialId: item.materialId,
                    percentage: item.percentage,
                    ...(item.plannedQtyKg !== undefined && { plannedQtyKg: item.plannedQtyKg })
                }))
            }
        },
        include: {
            product: true,
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
 * Updates recipe metadata only. Items are deliberately untouchable here —
 * changing composition would require re-validating the 100% total, and no
 * item-editing endpoint exists yet.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.isDefault`, `body.notes`.
 * @param {import('express').Response} res - 200 → updated Recipe aggregate; 404 unknown id; 500 on failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/recipes/d1e2…  { "isDefault": true }
 * // → 200 { id: "d1e2…", name: "Standard mix", isDefault: true, … }
 */
router.put('/:id', async (req, res) => {
    const { name, isDefault, notes } = req.body
    // TODO: setting isDefault: true here does NOT clear the flag on the
    // product's other recipes, so several "defaults" can coexist and the
    // wizard auto-picks whichever it finds first. Wrap in a transaction that
    // unsets siblings first. todo.md Group 5 #6.
    const recipe = await prisma.recipe.update({
        where: { id: req.params.id },
        data: {
            ...(name !== undefined && { name }),
            ...(isDefault !== undefined && { isDefault }),
            ...(notes !== undefined && { notes }),
        },
        include: {
            product: true,
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
