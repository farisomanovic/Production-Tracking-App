/**
 * Handles Parameter API routes for reusable machine measurements.
 * Stores parameter metadata such as unit and description.
 * Feeds machine-specific parameter configuration through link tables.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all configurable machine parameters in display order.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning parameter definitions.
 * @returns {Promise<void>} Sends 200 with parameters or 500 on Prisma read failure.
 */
router.get('/', async (req, res) => {
    try {
        const parameters = await prisma.parameter.findMany({
            orderBy: { name: 'asc' }
        })
        res.json(parameters)
    } catch (error) {
        console.error('GET all /parameters error:', error)
        res.status(500).json({ error: 'Failed to fetch parameters' })
    }
})

/**
 * GET /:id
 *
 * Returns one parameter definition by primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a parameter definition.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
router.get('/:id', async (req, res) => {
    try {       
        const parameter = await prisma.parameter.findUnique({
            where: { id: req.params.id }
        })
        if (!parameter) {
            return res.status(404).json({ error: 'Parameter not found' })
        }
        res.json(parameter)
    } catch (error) {
        console.error('GET single /parameters error:', error)
        res.status(500).json({ error: 'Failed to fetch parameter' })
    }   
})

/**
 * POST /
 *
 * Creates a reusable parameter definition that can later be assigned to one or
 * more machines through the machine-parameter link table.
 *
 * @param {import('express').Request} req - Express request with body.name and optional unit/description.
 * @param {import('express').Response} res - Express response returning the created parameter.
 * @returns {Promise<void>} Sends 201, 400 when name is missing, or 500 on Prisma failure.
 */
router.post('/', async (req, res) => {
    try {
        const { name, unit, description } = req.body
        if (!name) {
            return res.status(400).json({ error: 'name is required' })
        }
        const parameter = await prisma.parameter.create({
            data: { name,
                ...(unit !== undefined && { unit }),
                ...(description !== undefined && { description })
            }
        })
        res.status(201).json(parameter)
    } catch (error) {
        console.error('POST /parameters error:', error)
        res.status(500).json({ error: 'Failed to create parameter' })
    }       
})

/**
 * PUT /:id
 *
 * Updates the parameter metadata used when collecting production run values.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable parameter fields.
 * @param {import('express').Response} res - Express response returning the updated parameter.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 */
router.put('/:id', async (req, res) => {
    try {   
        const { name, unit, description } = req.body
        const parameter = await prisma.parameter.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(unit !== undefined && { unit }),
                ...(description !== undefined && { description })
            }
        })
        res.json(parameter)
    } catch (error) {
        console.error('PUT /parameters error:', error)
        res.status(500).json({ error: 'Failed to update parameter' })
    }   
})

export default router
