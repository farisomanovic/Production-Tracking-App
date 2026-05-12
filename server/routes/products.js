import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET method to fetch all products, ordered by name
router.get('/', async (req, res) => {
    try {
        const products = await prisma.product.findMany({
            orderBy: { name: 'asc' }
        })
    res.json(products)
    } catch (error) {
        console.error('GET /products error:', error)
        res.status(500).json({ error: 'Failed to fetch products' })
    }      
})

// GET method to fetch a single product by ID
router.get('/:id', async (req, res) => {
    try {
        const product = await prisma.product.findUnique({
            where: { id: req.params.id }
        })
        if (!product) {
            return res.status(404).json({ error: 'Product not found' })
        }
        res.json(product)
    } catch (error) {
        console.error('GET /products/:id error:', error)
        res.status(500).json({ error: 'Failed to fetch product' })
    }
})  

// POST method to create a new product
router.post('/', async (req, res) => {
    try {
        const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
        if (!name || !unit) {
            return res.status(400).json({ error: 'name and unit are required' })
        }
        const product = await prisma.product.create({
            data: { name, code,
                ...(widthMm !== undefined && { widthMm }),
                ...(thicknessMm !== undefined && { thicknessMm }),
                ...(lengthM !== undefined && { lengthM }),
                ...(description !== undefined && { description }),
                unit }
        })
        res.status(201).json(product)
    } catch (error) {
        console.error('POST /products error:', error)
        res.status(500).json({ error: 'Failed to create product' })
    }       
})

// PUT method to update a product
router.put('/:id', async (req, res) => {
    try {
        const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
        const product = await prisma.product.update({
            where: { id: req.params.id },
            data: {     
                ...(name !== undefined && { name }),
                ...(code !== undefined && { code }),
                ...(widthMm !== undefined && { widthMm }),
                ...(thicknessMm !== undefined && { thicknessMm }),
                ...(lengthM !== undefined && { lengthM }),
                ...(description !== undefined && { description }),
                ...(unit !== undefined && { unit })
            }   
        })  
        res.json(product)
    } catch (error) {
        console.error('PUT /products error:', error)
        res.status(500).json({ error: 'Failed to update product ' })
    }       
})

export default router