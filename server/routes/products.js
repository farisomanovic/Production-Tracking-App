/**
 * @file products.js
 * @description CRUD routes for Product master data (the items PakOm manufactures —
 * PP strapping and LDPE foil variants, identified by a unique code). Recipes,
 * machine compatibility, and run outputs reference products but are managed in
 * their own route files, not here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists every product.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Product[] sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/products
 * // → 200 [{ id: "c771…", name: "PP traka 12mm", code: "PP-12", unit: "kg", … }]
 */
router.get('/', async (req, res) => {
    const products = await prisma.product.findMany({
        orderBy: { name: 'asc' }
    })
    res.json(products)
})

/**
 * Fetches one product by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the product UUID.
 * @param {import('express').Response} res - 200 → Product; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/products/c771…
 * // → 200 { id: "c771…", name: "PP traka 12mm", code: "PP-12", widthMm: 12, … }
 */
router.get('/:id', async (req, res) => {
    const product = await prisma.product.findUnique({
        where: { id: req.params.id }
    })
    if (!product) {
        return res.status(404).json({ error: 'Product not found' })
    }
    res.json(product)
})

/**
 * Creates a product master record.
 *
 * @param {import('express').Request} req - `body.name`, `body.unit`, `body.code` (required);
 * dimensions and description optional.
 * @param {import('express').Response} res - 201 → created Product; 400 missing name/unit/code; 409 duplicate code; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/products  { "name": "LDPE folija 50µ", "code": "LD-50", "unit": "kg" }
 * // → 201 { id: "0b3c…", name: "LDPE folija 50µ", code: "LD-50", unit: "kg", … }
 */
router.post('/', async (req, res) => {
    const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
    if (!name || !unit || !code) {
        return res.status(400).json({ error: 'name, unit and code are required' })
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
})

/**
 * Partially updates a product.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of name/code/dimensions/description/unit.
 * @param {import('express').Response} res - 200 → updated Product; 404 unknown id; 409 duplicate code; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/products/c771…  { "thicknessMm": 0.55 }
 * // → 200 { id: "c771…", name: "PP traka 12mm", thicknessMm: 0.55, … }
 */
router.put('/:id', async (req, res) => {
    const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
    const product = await prisma.product.update({
        where: { id: req.params.id },
        data: {
            // Spread-if-defined keeps omitted fields untouched (partial update).
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
})

export default router
