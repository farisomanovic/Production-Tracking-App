/**
 * Handles Product API routes for manufactured item master data.
 * Stores dimensional, unit, and description fields for production outputs.
 * Supplies product records to machine compatibility and run workflows.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all products in display order.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning product records.
 * @returns {Promise<void>} Sends 200 with products or 500 on Prisma read failure.
 */
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

/**
 * GET /:id
 *
 * Returns one product by primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a product record.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
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

/**
 * POST /
 *
 * Creates a product master record. The product code is passed to Prisma because
 * the schema enforces code uniqueness at the database level.
 *
 * @param {import('express').Request} req - Express request with required name/unit and optional product fields.
 * @param {import('express').Response} res - Express response returning the created product.
 * @returns {Promise<void>} Sends 201, 400 when required fields are missing, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when product code uniqueness is violated.
 */
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

/**
 * PUT /:id
 *
 * Updates mutable product fields while preserving omitted values.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable product fields.
 * @param {import('express').Response} res - Express response returning the updated product.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when an updated product code conflicts.
 */
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
