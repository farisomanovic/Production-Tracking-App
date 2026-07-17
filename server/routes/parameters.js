/**
 * @file parameters.js
 * @description CRUD routes for Parameter definitions — reusable measurement types
 * (temperature, speed, pressure…) that machines later collect values for.
 * Machine assignment and display ordering do NOT belong here — see
 * machineParameters.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists every parameter definition.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Parameter[] sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/parameters
 * // → 200 [{ id: "e01b…", name: "Melt temp", unit: "°C", description: null }]
 */
router.get('/', async (req, res) => {
    const parameters = await prisma.parameter.findMany({
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
 * Creates a reusable parameter definition.
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
    if (!name) {
        return res.status(400).json({ error: 'name is required' })
    }
    let parameter
    try {
        parameter = await prisma.parameter.create({
            data: { name,
                ...(unit !== undefined && { unit }),
                ...(description !== undefined && { description })
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
 * Partially updates a parameter definition.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.unit`, `body.description`.
 * @param {import('express').Response} res - 200 → updated Parameter; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/parameters/e01b…  { "unit": "°F" }
 * // → 200 { id: "e01b…", name: "Melt temp", unit: "°F", description: null }
 */
router.put('/:id', async (req, res) => {
    const { name, unit, description } = req.body
    let parameter
    try {
        parameter = await prisma.parameter.update({
            where: { id: req.params.id },
            data: {
                // Spread-if-defined keeps omitted fields untouched (partial update).
                ...(name !== undefined && { name }),
                ...(unit !== undefined && { unit }),
                ...(description !== undefined && { description })
            }
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
