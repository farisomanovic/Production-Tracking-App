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
 * Creates a product master record.
 *
 * @param {import('express').Request} req - `body.name`, `body.unit` (required); `body.code` (required by the
 * schema but NOT validated here); dimensions and description optional.
 * @param {import('express').Response} res - 201 → created Product; 400 missing name/unit; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/products  { "name": "LDPE folija 50µ", "code": "LD-50", "unit": "kg" }
 * // → 201 { id: "0b3c…", name: "LDPE folija 50µ", code: "LD-50", unit: "kg", … }
 */
router.post('/', async (req, res) => {
    try {
        const { name, code, widthMm, thicknessMm, lengthM, description, unit } = req.body
        // TODO: code is required by the schema but not checked here — omitting it
        // throws a raw Prisma error and returns 500 instead of a clear 400.
        // Either validate it or make the column optional. todo.md Group 3 #1.
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
        // TODO: duplicate code → P2002 → 500 here; should be 409. todo.md Group 4 #5.
        console.error('POST /products error:', error)
        res.status(500).json({ error: 'Failed to create product' })
    }
})

/**
 * Partially updates a product.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of name/code/dimensions/description/unit.
 * @param {import('express').Response} res - 200 → updated Product; 500 on failure (including unknown id or duplicate code).
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/products/c771…  { "thicknessMm": 0.55 }
 * // → 200 { id: "c771…", name: "PP traka 12mm", thicknessMm: 0.55, … }
 */
router.put('/:id', async (req, res) => {
    try {
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
    } catch (error) {
        console.error('PUT /products error:', error)
        res.status(500).json({ error: 'Failed to update product ' })
    }
})

export default router
