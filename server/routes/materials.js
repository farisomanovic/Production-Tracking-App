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
    try {
        const materials = await prisma.material.findMany({
            orderBy: { name: 'asc' }
        })
        res.json(materials)
    } catch (error) {
        console.error('GET all /materials materials:', error)
        res.status(500).json({ error: 'Failed to fetch materials' })
    }
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
    try {
        const material = await prisma.material.findUnique({
            where: { id: req.params.id }
        })
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }
        res.json(material)
    } catch (error) {
        console.error('GET single /materials material:', error)
        res.status(500).json({ error: 'Failed to fetch material' })
    }
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
    try {
        const { name, unit, supplier, stockQty } = req.body
        if (!name || !unit) {
            return res.status(400).json({ error: 'name and unit are required' })
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
    } catch (error) {
        console.error('POST /materials material:', error)
        res.status(500).json({ error: 'Failed to create material' })
    }
})

/**
 * Partially updates a material, including overwriting its stock quantity.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of name/unit/supplier/stockQty.
 * @param {import('express').Response} res - 200 → updated Material; 500 on failure (including unknown id).
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/materials/a9d2…  { "stockQty": 1750.5 }
 * // → 200 { id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1750.5 }
 */
router.put('/:id', async (req, res) => {
    try {
        const { name, unit, supplier, stockQty } = req.body
        // TODO: stockQty here is an ABSOLUTE overwrite, and the client computes it
        // as (stale current + delivery) — two simultaneous deliveries lose one.
        // Accept a stockDelta and use Prisma's { increment } instead, like run
        // completion already does. todo.md Group 2 #1.
        const material = await prisma.material.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(unit !== undefined && { unit }),
                ...(supplier !== undefined && { supplier }),
                ...(stockQty !== undefined && { stockQty })
            }
        })
        res.json(material)
    } catch (error) {
        console.error('PUT /materials material:', error)
        res.status(500).json({ error: 'Failed to update material' })
    }
})

export default router
