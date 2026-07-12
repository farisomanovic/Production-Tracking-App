/**
 * @file machineProducts.js
 * @description Routes for the Machine↔Product link table: which products each
 * machine is allowed to produce. The new-run wizard uses these links to filter
 * its product dropdown. Product master data does NOT belong here — see products.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists a machine's product links with product details for display.
 *
 * @param {import('express').Request} req - `params.machineId` is the machine UUID.
 * @param {import('express').Response} res - 200 → MachineProduct[] (with `product`) ordered by product name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/machine-products/machine/7cd0…
 * // → 200 [{ id: "88c1…", product: { name: "PP traka 12mm", code: "PP-12" } }]
 */
router.get('/machine/:machineId', async (req, res) => {
    const links = await prisma.machineProduct.findMany({
        where: { machineId: req.params.machineId },
        orderBy: { product: { name: 'asc' } },
        include: { product: true }
    })
    res.json(links)
})

/**
 * Links a product to a machine; duplicates are rejected via the schema's
 * unique pair rather than a pre-check, so concurrent requests can't sneak past.
 *
 * @param {import('express').Request} req - `body.machineId`, `body.productId` (both required UUIDs).
 * @param {import('express').Response} res - 201 → created link; 400 missing ids or bad reference; 409 duplicate; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/machine-products  { "machineId": "7cd0…", "productId": "c771…" }
 * // → 201 { id: "88c1…", machineId: "7cd0…", productId: "c771…" }
 */
router.post('/', async (req, res, next) => {
    try {
        const { machineId, productId } = req.body
        if (!machineId || !productId) {
            return res.status(400).json({ error: 'machineId and productId are required' })
        }
        const link = await prisma.machineProduct.create({
            data: {
                machineId,
                productId
            }
        })
        res.status(201).json(link)
    } catch (error) {
        if (error.code === 'P2002') {
            return res.status(409).json({ error: 'This product is already linked to this machine' })
        }
        next(error)
    }
})

/**
 * Unlinks a product from a machine by link-table primary key. Safe for history:
 * ProductionRun references the product directly, not this link row.
 *
 * @param {import('express').Request} req - `params.id` is the MachineProduct link UUID.
 * @param {import('express').Response} res - 200 → confirmation message; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // DELETE /api/machine-products/88c1…
 * // → 200 { message: "Product unlinked from machine successfully" }
 */
router.delete('/:id', async (req, res) => {
    await prisma.machineProduct.delete({
        where: { id: req.params.id }
    })
    res.json({ message: 'Product unlinked from machine successfully' })
})

export default router
