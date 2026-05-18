/**
 * Handles Recipe API routes for product material formulas.
 * Persists recipe headers with nested material composition rows.
 * Enforces complete 100 percent formulas before production use.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all recipes with their product and material composition included.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning recipes with relations.
 * @returns {Promise<void>} Sends 200 with recipes or 500 on Prisma read failure.
 */
router.get('/', async (req, res) => {
    try {
        const recipes = await prisma.recipe.findMany({
            orderBy: { name: 'asc' },
            include: {
                // Include relation data needed to display each recipe as a full material breakdown.
                product: true,
                recipeItems: {
                    include: {
                        material: true
                    }
                }
            }
        })
        res.json(recipes)
    } catch (error) {
        console.error('GET all /recipes error:', error)
        res.status(500).json({ error: 'Failed to fetch recipes' })
    }
})

/**
 * GET /by-product/:productId
 *
 * Returns recipes for one product, including material details for selection and
 * review screens.
 *
 * @param {import('express').Request} req - Express request containing params.productId.
 * @param {import('express').Response} res - Express response returning product-specific recipes.
 * @returns {Promise<void>} Sends 200 with recipes or 500 on Prisma read failure.
 */
router.get('/by-product/:productId', async (req, res) => {
    try {
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
    } catch (error) {
        console.error('GET /recipes/by-product error:', error)
        res.status(500).json({ error: 'Failed to fetch recipes' })
    }
})

/**
 * GET /:id
 *
 * Returns one recipe by primary key with its product and recipe-item relations.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a recipe aggregate.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
router.get('/:id', async (req, res) => {
    try {
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
    } catch (error) {
        console.error('GET single /recipes/:id error:', error)
        res.status(500).json({ error: 'Failed to fetch recipe' })
    }
})

/**
 * POST /
 *
 * Creates a recipe and its RecipeItem rows in one nested write. Recipe items
 * must be present and total 100% so the bill of materials is complete.
 *
 * @param {import('express').Request} req - Express request with recipe metadata and items array.
 * @param {import('express').Response} res - Express response returning the created recipe aggregate.
 * @returns {Promise<void>} Sends 201, 400 for invalid formulas, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when schema-level uniqueness constraints are violated.
 */
router.post('/', async (req, res) => {
    try {
        const { name, productId, isDefault, notes, items } = req.body

        if (!name || !productId) {
            return res.status(400).json({ error: 'name and productId are required' })
        }

        // A recipe without materials cannot drive production planning.
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one recipe item is required' })
        }

        // Percentages must represent a complete formula before the recipe is saved.
        const total = items.reduce((sum, item) => sum + item.percentage, 0)
        if (Math.round(total) !== 100) {
            return res.status(400).json({ error: `Recipe items must add up to 100%. Currently: ${total}%` })
        }

        const recipe = await prisma.recipe.create({
            data: {
                name,
                productId,
                ...(isDefault !== undefined && { isDefault }),
                ...(notes !== undefined && { notes }),
                recipeItems: {
                    // Nested writes keep the Recipe and RecipeItem rows consistent in one create call.
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
    } catch (error) {
        console.error('POST /recipes error:', error)
        res.status(500).json({ error: 'Failed to create recipe' })
    }
})

/**
 * PUT /:id
 *
 * Updates recipe metadata. Recipe items are not modified here because changing
 * formula composition requires separate validation of the 100% total.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable recipe fields.
 * @param {import('express').Response} res - Express response returning the updated recipe aggregate.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, isDefault, notes } = req.body
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
    } catch (error) {
        console.error('PUT /recipes/:id error:', error)
        res.status(500).json({ error: 'Failed to update recipe' })
    }
})

export default router
