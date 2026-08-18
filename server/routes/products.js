/**
 * @file products.js
 * @description CRUD routes for Product master data (the items PakOm manufactures —
 * PP strapping and LDPE foil variants, identified by a unique code). Recipes,
 * machine compatibility, and run outputs reference products but are managed in
 * their own route files, not here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { isFiniteNumber, isNonEmptyString, isValidUnit, normalizeCode, normalizeName, normalizeOptionalText, VALID_UNITS } from '../lib/validation.js'
import { parseActiveFilter } from '../lib/queryFilters.js'
import { lockAndAssertNoOpenRun } from '../lib/deactivationGuards.js'

const router = Router()

// Shared by POST and PUT below: a product dimension of exactly 0 is
// physically impossible, so — unlike some optional numeric fields elsewhere
// in the app — 0 is rejected here alongside negatives/strings.
function dimensionError(res, name, value) {
    if (value !== undefined && (!isFiniteNumber(value) || value <= 0)) {
        res.status(400).json({ error: `${name} must be a number greater than 0 when provided` })
        return true
    }
    return false
}

/**
 * Lists products, optionally narrowed to active or inactive ones.
 *
 * Unfiltered by default because the admin page needs inactive rows to offer
 * reactivation; selection dropdowns pass `?active=true`.
 *
 * @param {import('express').Request} req - Optional query: `active` ("true" | "false").
 * @param {import('express').Response} res - 200 → Product[] sorted by name; 400 on a malformed
 * `active`; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/products?active=true
 * // → 200 [{ id: "c771…", name: "PP traka 12mm", code: "PP-12", unit: "kg", active: true, … }]
 */
router.get('/', async (req, res) => {
    const products = await prisma.product.findMany({
        where: { ...parseActiveFilter(req.query.active) },
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
 * Creates a product master record. `active` is deliberately not accepted —
 * it defaults to true in the schema, and taking it here would let a client
 * create a pre-deactivated row (same rule as operators.js's POST).
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
    if (!isNonEmptyString(name) || !isNonEmptyString(unit) || !isNonEmptyString(code)) {
        return res.status(400).json({ error: 'name, unit and code are required' })
    }
    if (!isValidUnit(unit)) {
        return res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` })
    }
    if (description !== undefined && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' })
    }
    if (dimensionError(res, 'widthMm', widthMm) || dimensionError(res, 'thicknessMm', thicknessMm) || dimensionError(res, 'lengthM', lengthM)) {
        return
    }
    let product
    try {
        product = await prisma.product.create({
            // code is trimmed, never nulled: unlike Machine.code this column is
            // required and unique, so "  PP-12  " and "PP-12" would otherwise be
            // two distinct unique keys for one physical product. The blank guard
            // above runs first, which is what keeps normalizeCode's null branch
            // unreachable here — a null would violate NOT NULL.
            data: { name: normalizeName(name), code: normalizeCode(code),
                ...(widthMm !== undefined && { widthMm }),
                ...(thicknessMm !== undefined && { thicknessMm }),
                ...(lengthM !== undefined && { lengthM }),
                ...(description !== undefined && { description: normalizeOptionalText(description) }),
                unit }
        })
    } catch (error) {
        // Product_code_key is the model's only unique constraint, so naming the
        // field here is unambiguous. Status (409) is the central error
        // middleware's call, not this route's.
        if (error.code === 'P2002') {
            error.clientMessage = 'A product with this code already exists'
        }
        throw error
    }
    res.status(201).json(product)
})

/**
 * Partially updates a product; `active: false` is the soft-delete path.
 * `unit` is write-once — it may be resent with its current value, but never
 * changed; see the guard below for why.
 *
 * @param {import('express').Request} req - `params.id` UUID; any subset of
 * name/code/dimensions/description/unit/active.
 * @param {import('express').Response} res - 200 → updated Product; 400 blank/non-string name or code,
 * bad unit, or non-boolean active; 404 unknown id; 409 duplicate code, an attempt to change unit,
 * or a deactivation blocked by an in-progress run; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/products/c771…  { "active": false }
 * // → 200 { id: "c771…", name: "PP traka 12mm", active: false, … }
 */
router.put('/:id', async (req, res) => {
    const { name, code, widthMm, thicknessMm, lengthM, description, unit, active } = req.body
    for (const [field, value] of Object.entries({ name, code, unit, description })) {
        if (value !== undefined && typeof value !== 'string') {
            return res.status(400).json({ error: `${field} must be a string` })
        }
    }
    if (active !== undefined && typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' })
    }
    // Both must stay after the typeof loop and before normalizeCode below: the
    // loop owns the non-string message, and normalizeCode turns a blank into
    // null, which these required columns cannot hold. NOT NULL does not mean
    // "has a value" to Postgres — "" satisfies both columns.
    if (name !== undefined && !isNonEmptyString(name)) {
        return res.status(400).json({ error: 'name cannot be blank' })
    }
    if (code !== undefined && !isNonEmptyString(code)) {
        return res.status(400).json({ error: 'code cannot be blank' })
    }
    if (unit !== undefined && !isValidUnit(unit)) {
        return res.status(400).json({ error: `unit must be one of: ${VALID_UNITS.join(', ')}` })
    }
    if (dimensionError(res, 'widthMm', widthMm) || dimensionError(res, 'thicknessMm', thicknessMm) || dimensionError(res, 'lengthM', lengthM)) {
        return
    }
    // 409, not 400: the value is well-formed and in the allow-list, it just
    // conflicts with a column that is write-once. ProductionRun stores
    // quantityProduced as a bare number whose meaning is read off product.unit
    // at display time (client/src/lib/materialSplit.js isWeightUnit decides
    // whether it is kilograms or a piece count), so moving the unit rewrites
    // what every past run of this product is understood to have produced.
    // Compared against the stored value rather than rejected on sight, so a
    // full-object PUT that resends an unchanged unit still works. A missing row
    // falls through to the update below, keeping the 404 in one place. Unlike
    // the read-then-act in machineProducts.js this needs no transaction: the
    // only write that could invalidate the read is another unit change, which
    // this guard now rejects.
    if (unit !== undefined) {
        const existing = await prisma.product.findUnique({
            where: { id: req.params.id },
            select: { unit: true }
        })
        if (existing && unit !== existing.unit) {
            return res.status(409).json({ error: 'unit cannot be changed after a product is created' })
        }
    }
    let product
    try {
        // The guard and the update share one transaction so the row stays locked
        // between them — same shape and same reasoning as operators.js's PUT.
        product = await prisma.$transaction(async (tx) => {
            if (active === false) {
                await lockAndAssertNoOpenRun(tx, 'product', req.params.id,
                    'Cannot deactivate this product while a run is in progress')
            }
            return tx.product.update({
                where: { id: req.params.id },
                data: {
                    // Spread-if-defined keeps omitted fields untouched (partial update).
                    ...(name !== undefined && { name: normalizeName(name) }),
                    ...(code !== undefined && { code: normalizeCode(code) }),
                    ...(widthMm !== undefined && { widthMm }),
                    ...(thicknessMm !== undefined && { thicknessMm }),
                    ...(lengthM !== undefined && { lengthM }),
                    ...(description !== undefined && { description: normalizeOptionalText(description) }),
                    ...(unit !== undefined && { unit }),
                    ...(active !== undefined && { active })
                }
            })
        })
    } catch (error) {
        if (error.code === 'P2002') {
            error.clientMessage = 'A product with this code already exists'
        }
        throw error
    }
    res.json(product)
})

export default router
