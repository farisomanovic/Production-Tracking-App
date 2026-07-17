/**
 * @file recipeProducts.js
 * @description Routes for the Recipe↔Product link table: which products a
 * recipe's formula is valid for. Mirrors machineProducts.js. Recipe/RecipeItem
 * composition does NOT belong here — see recipes.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists a recipe's product links with product details for display.
 *
 * @param {import('express').Request} req - `params.recipeId` is the recipe UUID.
 * @param {import('express').Response} res - 200 → RecipeProduct[] (with `product`) ordered by product name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipe-products/recipe/d1e2…
 * // → 200 [{ id: "f0a1…", product: { name: "PP traka 12mm", code: "PP-12" } }]
 */
router.get('/recipe/:recipeId', async (req, res) => {
    const links = await prisma.recipeProduct.findMany({
        where: { recipeId: req.params.recipeId },
        orderBy: { product: { name: 'asc' } },
        include: { product: true }
    })
    res.json(links)
})

/**
 * Lists a product's recipe links with recipe details — the product-detail
 * page's source for "which recipes can make this product, and which is the
 * default." Mirrors GET /recipe/:recipeId in the other direction.
 *
 * @param {import('express').Request} req - `params.productId` is the product UUID.
 * @param {import('express').Response} res - 200 → RecipeProduct[] (with `recipe` + its `recipeItems`) ordered by recipe name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/recipe-products/product/c771…
 * // → 200 [{ id: "f0a1…", isDefault: true, recipe: { name: "Standard mix", active: true } }]
 */
router.get('/product/:productId', async (req, res) => {
    const links = await prisma.recipeProduct.findMany({
        where: { productId: req.params.productId },
        orderBy: { recipe: { name: 'asc' } },
        include: { recipe: { include: { recipeItems: true } } }
    })
    res.json(links)
})

/**
 * Links a product to a recipe; duplicates are rejected via the schema's
 * unique pair rather than a pre-check, so concurrent requests can't sneak past.
 *
 * @param {import('express').Request} req - `body.recipeId`, `body.productId` (both required UUIDs).
 * @param {import('express').Response} res - 201 → created link; 400 missing ids or bad reference; 409 duplicate; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/recipe-products  { "recipeId": "d1e2…", "productId": "c771…" }
 * // → 201 { id: "f0a1…", recipeId: "d1e2…", productId: "c771…" }
 */
router.post('/', async (req, res, next) => {
    try {
        const { recipeId, productId } = req.body
        if (!recipeId || !productId) {
            return res.status(400).json({ error: 'recipeId and productId are required' })
        }
        const link = await prisma.recipeProduct.create({
            data: {
                recipeId,
                productId
            }
        })
        res.status(201).json(link)
    } catch (error) {
        // Status (409) is the central error middleware's call, not this route's —
        // only the friendlier message is route-specific.
        if (error.code === 'P2002') {
            error.clientMessage = 'This product is already linked to this recipe'
        }
        next(error)
    }
})

/**
 * Sets or clears this link's default flag. Setting true is transactional:
 * every other RecipeProduct row for the same product is cleared to false in
 * the same transaction, so RecipeProduct_one_default_per_product (the
 * partial unique index backing "one default per product") is never even
 * transiently at risk from this route's own write. This is a last-write-wins
 * UI toggle, not a race for a scarce resource — two concurrent "set as
 * default" calls for the same product both succeed (200/200); the
 * transaction's updateMany serializes them via Postgres row locking, so
 * whichever commits second simply re-clears the other's flag and sets its
 * own. Setting false needs no transaction — clearing a flag can't collide
 * with the unique index.
 *
 * @param {import('express').Request} req - `params.id` is the RecipeProduct link UUID; `body.isDefault` (required boolean).
 * @param {import('express').Response} res - 200 → updated link (with `product`); 400 missing/non-boolean isDefault, or setting true on an inactive recipe's link; 404 unknown link id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/recipe-products/f0a1…  { "isDefault": true }
 * // → 200 { id: "f0a1…", isDefault: true, product: { name: "PP traka 12mm" } }
 */
router.put('/:id', async (req, res) => {
    const { isDefault } = req.body
    if (typeof isDefault !== 'boolean') {
        return res.status(400).json({ error: 'isDefault must be a boolean' })
    }

    const link = await prisma.recipeProduct.findUnique({
        where: { id: req.params.id },
        select: { productId: true, recipe: { select: { active: true } } }
    })
    if (!link) {
        return res.status(404).json({ error: 'Link not found' })
    }

    if (isDefault === false) {
        const updated = await prisma.recipeProduct.update({
            where: { id: req.params.id },
            data: { isDefault: false },
            include: { product: true }
        })
        return res.json(updated)
    }

    // Mirrors the wizard's own active-only filter (GET /recipes/by-product) —
    // an inactive recipe can never actually be offered to an operator, so
    // letting it become "the default" here would just recreate the exact
    // dead-flag situation todo.md Group 5 #6 flagged in the first place.
    if (!link.recipe.active) {
        return res.status(400).json({ error: 'Cannot set an inactive recipe as the default' })
    }

    const updated = await prisma.$transaction(async (tx) => {
        await tx.recipeProduct.updateMany({
            where: { productId: link.productId, NOT: { id: req.params.id } },
            data: { isDefault: false }
        })
        return tx.recipeProduct.update({
            where: { id: req.params.id },
            data: { isDefault: true },
            include: { product: true }
        })
    })
    res.json(updated)
})

/**
 * Unlinks a product from a recipe by link-table primary key. Blocked when this
 * is the recipe's last remaining product link — a recipe must always stay
 * usable by at least one product (same "must have ≥1" contract as RecipeItem
 * on creation).
 *
 * @param {import('express').Request} req - `params.id` is the RecipeProduct link UUID.
 * @param {import('express').Response} res - 200 → confirmation message; 404 unknown id;
 * 409 if this is the recipe's last linked product; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // DELETE /api/recipe-products/f0a1…
 * // → 200 { message: "Product unlinked from recipe successfully" }
 */
router.delete('/:id', async (req, res) => {
    const link = await prisma.recipeProduct.findUnique({
        where: { id: req.params.id },
        select: { recipeId: true }
    })
    if (!link) {
        return res.status(404).json({ error: 'Link not found' })
    }
    // 409, not 400: this rejects because of a conflicting CURRENT state (the
    // recipe would end up with zero products), not bad input. Known residual
    // race: this is a plain read-then-act, not transaction-wrapped, same as
    // machineProducts.js's unlink guard.
    const linkedProductCount = await prisma.recipeProduct.count({ where: { recipeId: link.recipeId } })
    if (linkedProductCount <= 1) {
        return res.status(409).json({ error: 'A recipe must have at least one linked product' })
    }
    await prisma.recipeProduct.delete({
        where: { id: req.params.id }
    })
    res.json({ message: 'Product unlinked from recipe successfully' })
})

export default router
