/**
 * @file materials.js
 * @description CRUD routes for Material master data (raw production inputs) plus
 * their live stock quantity. Stock is DECREMENTED by run completion in
 * productionRuns.js — this file only handles master data and manual stock edits.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists every material with its current stock.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Material[] sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/materials
 * // → 200 [{ id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1250.5 }]
 */
router.get('/', async (req, res) => {
    const materials = await prisma.material.findMany({
        orderBy: { name: 'asc' }
    })
    res.json(materials)
})

/**
 * Fetches one material by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the material UUID.
 * @param {import('express').Response} res - 200 → Material; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/materials/a9d2…
 * // → 200 { id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1250.5 }
 */
router.get('/:id', async (req, res) => {
    const material = await prisma.material.findUnique({
        where: { id: req.params.id }
    })
    if (!material) {
        return res.status(404).json({ error: 'Material not found' })
    }
    res.json(material)
})

/**
 * Creates a material master record with optional supplier and opening stock.
 *
 * @param {import('express').Request} req - `body.name`, `body.unit` (required); `body.supplier`,
 * `body.stockQty` (optional — stock defaults to 0 in the schema).
 * @param {import('express').Response} res - 201 → created Material; 400 missing name/unit; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/materials  { "name": "LDPE regranulat", "unit": "kg", "stockQty": 500 }
 * // → 201 { id: "77b0…", name: "LDPE regranulat", unit: "kg", stockQty: 500 }
 */
router.post('/', async (req, res) => {
    const { name, unit, supplier, stockQty } = req.body
    if (!name || !unit) {
        return res.status(400).json({ error: 'name and unit are required' })
    }
    // The DB CHECK (stockQty >= 0) would reject this anyway, but as a raw 500.
    if (stockQty !== undefined && (typeof stockQty !== 'number' || !Number.isFinite(stockQty) || stockQty < 0)) {
        return res.status(400).json({ error: 'stockQty must be a number of at least 0' })
    }
    // TODO: name has no unique constraint and the XLSX export matches material
    // columns BY NAME — duplicates silently merge in reports. todo.md Group 5 #5.
    const material = await prisma.material.create({
        data: { name, unit,
            ...(supplier !== undefined && { supplier }),
            ...(stockQty !== undefined && { stockQty })
        }
    })
    res.status(201).json(material)
})

/**
 * Partially updates a material. Stock can be adjusted two ways: `stockDelta`
 * atomically adds to the current value (deliveries), `stockQty` sets it
 * outright (corrections). Send only one — if both are present, stockDelta wins.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of name/unit/supplier/stockDelta/stockQty.
 * @param {import('express').Response} res - 200 → updated Material; 400 invalid numbers; 404 unknown id;
 * 409 when a negative stockDelta would take stock below zero; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/materials/a9d2…  { "stockDelta": 500 }
 * // → 200 { id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1750.5 }
 */
router.put('/:id', async (req, res) => {
    const { name, unit, supplier, stockQty, stockDelta } = req.body

    // Stock has a hard floor: the DB CHECK (stockQty >= 0) would reject these
    // anyway, but as an unreadable 500 — validate here for a clear message.
    if (stockQty !== undefined && (typeof stockQty !== 'number' || !Number.isFinite(stockQty) || stockQty < 0)) {
        return res.status(400).json({ error: 'stockQty must be a number of at least 0' })
    }
    if (stockDelta !== undefined && (typeof stockDelta !== 'number' || !Number.isFinite(stockDelta))) {
        return res.status(400).json({ error: 'stockDelta must be a number' })
    }

    // updateMany instead of update: a negative delta only applies when enough
    // stock exists (the WHERE condition and the increment are one atomic
    // statement — same pattern as run completion in productionRuns.js).
    const { count } = await prisma.material.updateMany({
        where: {
            id: req.params.id,
            ...(stockDelta !== undefined && stockDelta < 0 && { stockQty: { gte: -stockDelta } })
        },
        data: {
            ...(name !== undefined && { name }),
            ...(unit !== undefined && { unit }),
            ...(supplier !== undefined && { supplier }),
            ...(stockDelta !== undefined
                ? { stockQty: { increment: stockDelta } }
                : stockQty !== undefined && { stockQty })
        }
    })
    if (count === 0) {
        // Nothing matched: either the id is unknown, or the guarded negative
        // delta found too little stock — read the row to tell them apart.
        const material = await prisma.material.findUnique({ where: { id: req.params.id } })
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }
        return res.status(409).json({
            error: `Stock cannot go below zero: ${material.stockQty} ${material.unit} available, tried to remove ${-stockDelta}`
        })
    }
    // updateMany returns only a count — re-read the row for the response body.
    const material = await prisma.material.findUnique({ where: { id: req.params.id } })
    res.json(material)
})

export default router
