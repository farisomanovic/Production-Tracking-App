/**
 * @file parameters.js
 * @description CRUD routes for Parameter definitions — reusable measurement types
 * (temperature, speed, pressure…) that machines later collect values for.
 * Machine assignment and display ordering do NOT belong here — see
 * machineParameters.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { normalizeName, isNonEmptyString, normalizeOptionalText } from '../lib/validation.js'
import { parseActiveFilter } from '../lib/queryFilters.js'
import { lockAndAssertNoOpenRun } from '../lib/deactivationGuards.js'

const router = Router()

/**
 * Lists parameter definitions, optionally narrowed to active or inactive ones.
 *
 * Unfiltered by default because the admin page needs inactive rows to offer
 * reactivation; the machine-setup picker passes `?active=true`.
 *
 * @param {import('express').Request} req - Optional query: `active` ("true" | "false").
 * @param {import('express').Response} res - 200 → Parameter[] sorted by name; 400 on a malformed
 * `active`; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/parameters?active=true
 * // → 200 [{ id: "e01b…", name: "Melt temp", unit: "°C", description: null, active: true }]
 */
router.get('/', async (req, res) => {
    const parameters = await prisma.parameter.findMany({
        where: { ...parseActiveFilter(req.query.active) },
        orderBy: { name: 'asc' }
    })
    res.json(parameters)
})

/**
 * Fetches one parameter definition by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the parameter UUID.
 * @param {import('express').Response} res - 200 → Parameter; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/parameters/e01b…
 * // → 200 { id: "e01b…", name: "Melt temp", unit: "°C", description: null }
 */
router.get('/:id', async (req, res) => {
    const parameter = await prisma.parameter.findUnique({
        where: { id: req.params.id }
    })
    if (!parameter) {
        return res.status(404).json({ error: 'Parameter not found' })
    }
    res.json(parameter)
})

/**
 * Creates a reusable parameter definition. `active` is deliberately not
 * accepted — it defaults to true in the schema, and taking it here would let a
 * client create a pre-deactivated row (same rule as operators.js POST).
 *
 * @param {import('express').Request} req - `body.name` (required); `body.unit`, `body.description` (optional).
 * @param {import('express').Response} res - 201 → created Parameter; 400 missing name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/parameters  { "name": "Line speed", "unit": "m/min" }
 * // → 201 { id: "f4a9…", name: "Line speed", unit: "m/min", description: null }
 */
router.post('/', async (req, res) => {
    const { name, unit, description } = req.body
    if (!isNonEmptyString(name)) {
        return res.status(400).json({ error: 'name is required' })
    }
    if (unit !== undefined && typeof unit !== 'string') {
        return res.status(400).json({ error: 'unit must be a string' })
    }
    if (description !== undefined && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' })
    }
    const normalizedName = normalizeName(name)
    let parameter
    try {
        parameter = await prisma.parameter.create({
            // `unit` is normalized but deliberately NOT validated against
            // VALID_UNITS: a parameter's unit is free text (°C, bar, m/min) by
            // design, unlike Product.unit and Material.unit. Trimming is not
            // validation and does not close that vocabulary — it only stops
            // "bar" and "bar " from being two units in the export.
            data: { name: normalizedName,
                ...(unit !== undefined && { unit: normalizeOptionalText(unit) }),
                ...(description !== undefined && { description: normalizeOptionalText(description) })
            }
        })
    } catch (error) {
        if (error.code === 'P2002') {
            error.clientMessage = 'A parameter with this name already exists'
        }
        throw error
    }
    res.status(201).json(parameter)
})

/**
 * Partially updates a parameter definition; `active: false` is the soft-delete
 * path.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.unit`,
 * `body.description`, `body.active`.
 * @param {import('express').Response} res - 200 → updated Parameter; 400 non-string field or
 * non-boolean active; 404 unknown id; 409 a deactivation blocked by an in-progress run on a
 * machine that collects this parameter; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/parameters/e01b…  { "active": false }
 * // → 200 { id: "e01b…", name: "Melt temp", unit: "°C", active: false }
 */
router.put('/:id', async (req, res) => {
    const { name, unit, description, active } = req.body
    if (name !== undefined && typeof name !== 'string') {
        return res.status(400).json({ error: 'name must be a string' })
    }
    if (unit !== undefined && typeof unit !== 'string') {
        return res.status(400).json({ error: 'unit must be a string' })
    }
    if (description !== undefined && typeof description !== 'string') {
        return res.status(400).json({ error: 'description must be a string' })
    }
    if (active !== undefined && typeof active !== 'boolean') {
        return res.status(400).json({ error: 'active must be a boolean' })
    }
    const normalizedName = name !== undefined ? normalizeName(name) : undefined
    if (normalizedName === '') {
        return res.status(400).json({ error: 'name cannot be blank' })
    }
    let parameter
    try {
        // The guard and the update share one transaction so the row stays locked
        // between them — same shape and same reasoning as operators.js's PUT.
        parameter = await prisma.$transaction(async (tx) => {
            if (active === false) {
                await lockAndAssertNoOpenRun(tx, 'parameter', req.params.id,
                    'Cannot deactivate this parameter while a machine that collects it has a run in progress')
            }
            return tx.parameter.update({
                where: { id: req.params.id },
                data: {
                    // Spread-if-defined keeps omitted fields untouched (partial update).
                    ...(normalizedName !== undefined && { name: normalizedName }),
                    ...(unit !== undefined && { unit: normalizeOptionalText(unit) }),
                    ...(description !== undefined && { description: normalizeOptionalText(description) }),
                    ...(active !== undefined && { active })
                }
            })
        })
    } catch (error) {
        if (error.code === 'P2002') {
            error.clientMessage = 'A parameter with this name already exists'
        }
        throw error
    }
    res.json(parameter)
})

export default router
