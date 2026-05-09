import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all recipes
router.get('/', async (req, res) => {
    try {
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
    } catch (error) {
        console.error('GET all /recipes error:', error)
        res.status(500).json({ error: 'Failed to fetch recipes' })
    }
})

// GET recepies for single product
// GET all recipes for a single product
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

// GET single recipe by id
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

// POST create recipe with items
router.post('/', async (req, res) => {
    try {
        const { name, productId, isDefault, notes, items } = req.body

        // Guard required fields
        if (!name || !productId) {
            return res.status(400).json({ error: 'name and productId are required' })
        }

        // Guard items exist and are not empty
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'At least one recipe item is required' })
        }

        // Guard percentages add up to 100
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

// PUT update recipe
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