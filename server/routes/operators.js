/**
 * Handles Operator API routes for production staff records.
 * Supports create, read, and update workflows from the admin UI.
 * Preserves historical run links through active-flag soft deletion.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all operators in display order.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning an array of operators.
 * @returns {Promise<void>} Sends 200 with operators or 500 when Prisma cannot read records.
 */
router.get('/', async (req, res) => {
  try {
    const operators = await prisma.operator.findMany({
      orderBy: { name: 'asc' }
    })
    res.json(operators)
  } catch (error) {
    console.error('GET all /operators error:', error)
    res.status(500).json({ error: 'Failed to fetch operators' })
  }
})

/**
 * GET /:id
 *
 * Returns one operator by primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning the operator payload.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
router.get('/:id', async (req, res) => {
  try {
    const operator = await prisma.operator.findUnique({
      where: { id: req.params.id }
    })
    if (!operator) {
      return res.status(404).json({ error: 'Operator not found' })
    }
    res.json(operator)
  } catch (error) {
    console.error('GET single /operators error:', error)
    res.status(500).json({ error: 'Failed to fetch operator' })
  }
})

/**
 * POST /
 *
 * Creates an operator. Operators are active by default according to the Prisma
 * schema, so only the required name is accepted here.
 *
 * @param {import('express').Request} req - Express request with body.name.
 * @param {import('express').Response} res - Express response returning the created operator.
 * @returns {Promise<void>} Sends 201, 400 when name is missing, or 500 on Prisma failure.
 */
router.post('/', async (req, res) => {
  try {
    const { name } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name is required' })
    }
    const operator = await prisma.operator.create({
      data: { name }
    })
    res.status(201).json(operator)
  } catch (error) {
    console.error('POST /operators error:', error)
    res.status(500).json({ error: 'Failed to create operator' })
  }
})

/**
 * PUT /:id
 *
 * Updates mutable operator fields. The active flag supports soft deletion
 * without breaking historical production run relations.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable operator fields.
 * @param {import('express').Response} res - Express response returning the updated operator.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, active } = req.body
    const operator = await prisma.operator.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        // Soft deletion: active=false hides the operator from new workflows while
        // retaining foreign-key history for completed production runs.
        ...(active !== undefined && { active }),
      }
    })
    res.json(operator)
  } catch (error) {
    console.error('PUT /operators error:', error)
    res.status(500).json({ error: 'Failed to update operator' })
  }
})

export default router
