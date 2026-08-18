/**
 * @file materials.js
 * @description CRUD routes for Material master data (raw production inputs) plus
 * their live stock quantity. Stock is DECREMENTED by run completion in
 * productionRuns.js — this file only handles master data and manual stock edits.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { normalizeName, isNonEmptyString, isValidUnit, normalizeOptionalText, VALID_UNITS } from '../lib/validation.js'
import { parseActiveFilter } from '../lib/queryFilters.js'
import { lockAndAssertNoOpenRun } from '../lib/deactivationGuards.js'

const router = Router()

/**
 * Lists materials with their current stock, optionally narrowed to active or
 * inactive ones.
 *
 * Unfiltered by default because the admin page needs inactive rows to offer
 * reactivation; the recipe builder passes `?active=true`.
 *
 * @param {import('express').Request} req - Optional query: `active` ("true" | "false").
 * @param {import('express').Response} res - 200 → Material[] sorted by name; 400 on a malformed
 * `active`; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/materials?active=true
 * // → 200 [{ id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1250.5, active: true }]
 */
router.get('/', async (req, res) => {
    const materials = await prisma.material.findMany({
        where: { ...parseActiveFilter(req.query.active) },
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
 * `active` is deliberately not accepted — it defaults to true in the schema, and
 * taking it here would let a client create a pre-deactivated row (same rule as
 * operators.js POST).
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
    if (!isNonEmptyString(name) || !isNonEmptyString(unit)) {
        return res.status(400).json({ error: 'name and unit are required' })
    }
    if (!isValidUnit(unit)) {
        return res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` })
    }
    if (supplier !== undefined && typeof supplier !== 'string') {
        return res.status(400).json({ error: 'supplier must be a string' })
    }
    // The DB CHECK (stockQty >= 0) would reject this anyway, but as a raw 500.
    if (stockQty !== undefined && (typeof stockQty !== 'number' || !Number.isFinite(stockQty) || stockQty < 0)) {
        return res.status(400).json({ error: 'stockQty must be a number of at least 0' })
    }
    const normalizedName = normalizeName(name)
    let material
    try {
        material = await prisma.material.create({
            data: { name: normalizedName, unit,
                ...(supplier !== undefined && { supplier: normalizeOptionalText(supplier) }),
                ...(stockQty !== undefined && { stockQty })
            }
        })
    } catch (error) {
        if (error.code === 'P2002') {
            error.clientMessage = 'A material with this name already exists'
        }
        throw error
    }
    res.status(201).json(material)
})

/**
 * Partially updates a material. Stock can be adjusted two ways: `stockDelta`
 * atomically adds to the current value (deliveries), `stockQty` sets it
 * outright (corrections). Send only one — if both are present, stockDelta wins.
 * A body carrying none of these fields is a no-op that returns the row unchanged.
 *
 * `active: false` is the soft-delete path.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of
 * name/unit/supplier/stockDelta/stockQty/active.
 * @param {import('express').Response} res - 200 → updated Material; 400 invalid numbers or a
 * non-boolean active; 404 unknown id; 409 when a negative stockDelta would take stock below zero,
 * or when a deactivation is blocked by an in-progress run using this material; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/materials/a9d2…  { "stockDelta": 500 }
 * // → 200 { id: "a9d2…", name: "PP granulat", unit: "kg", stockQty: 1750.5 }
 */
router.put('/:id', async (req, res) => {
    const { name, unit, supplier, stockQty, stockDelta, active } = req.body
    if (name !== undefined && typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' })
    }
    if (active !== undefined && typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' })
    }
    if (unit !== undefined && typeof unit !== 'string') {
        return res.status(400).json({ error: 'unit must be a string' })
    }
    if (unit !== undefined && !isValidUnit(unit)) {
        return res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` })
    }
    if (supplier !== undefined && typeof supplier !== 'string') {
        return res.status(400).json({ error: 'supplier must be a string' })
    }
    const normalizedName = name !== undefined ? normalizeName(name) : undefined

    if (normalizedName === '') {
        return res.status(400).json({ error: 'name cannot be blank' })
    }
    // Stock has a hard floor: the DB CHECK (stockQty >= 0) would reject these
    // anyway, but as an unreadable 500 — validate here for a clear message.
    if (stockQty !== undefined && (typeof stockQty !== 'number' || !Number.isFinite(stockQty) || stockQty < 0)) {
        return res.status(400).json({ error: 'stockQty must be a number of at least 0' })
    }
    if (stockDelta !== undefined && (typeof stockDelta !== 'number' || !Number.isFinite(stockDelta))) {
        return res.status(400).json({ error: 'stockDelta must be a number' })
    }

    const data = {
        ...(normalizedName !== undefined && { name: normalizedName }),
        ...(unit !== undefined && { unit }),
        ...(supplier !== undefined && { supplier: normalizeOptionalText(supplier) }),
        ...(active !== undefined && { active }),
        ...(stockDelta !== undefined
            ? { stockQty: { increment: stockDelta } }
            : stockQty !== undefined && { stockQty })
    }

    // A body carrying none of the mutable fields writes nothing, so no guard can
    // have been tripped — and it must skip the write entirely, because Prisma
    // reports count: 0 for an empty `data` even when the row matched, which the
    // branch below would otherwise misread as an overdrawn stock conflict.
    if (Object.keys(data).length > 0) {
        // updateMany instead of update: a negative delta only applies when enough
        // stock exists (the WHERE condition and the increment are one atomic
        // statement — same pattern as run completion in productionRuns.js).
        //
        // The transaction WRAPS that statement, it does not replace it. The
        // deactivation guard needs the row locked from before it reads
        // ProductionRun until after the write commits (see operators.js's PUT),
        // and the stock floor needs its WHERE and its increment to stay one
        // statement — both hold here, because the single updateMany is still a
        // single statement, now issued inside the same transaction as the lock.
        let count
        try {
            ;({ count } = await prisma.$transaction(async (tx) => {
                if (active === false) {
                    await lockAndAssertNoOpenRun(tx, 'material', req.params.id,
                        'Cannot deactivate this material while a run using it is in progress')
                }
                return tx.material.updateMany({
                    where: {
                        id: req.params.id,
                        ...(stockDelta !== undefined && stockDelta < 0 && { stockQty: { gte: -stockDelta } })
                    },
                    data
                })
            }))
        } catch (error) {
            if (error.code === 'P2002') {
                error.clientMessage = 'A material with this name already exists'
            }
            throw error
        }
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
    }
    // updateMany returns only a count — re-read the row for the response body.
    // The row can be absent here two ways: an unknown id that skipped the write
    // above, or a delete landing between the write and this read.
    const material = await prisma.material.findUnique({ where: { id: req.params.id } })
    if (!material) {
        return res.status(404).json({ error: 'Material not found' })
    }
    res.json(material)
})

export default router
