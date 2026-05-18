/**
 * Handles Machine API routes for production equipment records.
 * Supports operational reads and admin maintenance updates.
 * Uses active-flag soft deletion to protect historical run traceability.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all machines in display order.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning machine records.
 * @returns {Promise<void>} Sends 200 with machines or 500 on Prisma read failure.
 */
router.get('/', async (req, res) => {
  try {
    const machines = await prisma.machine.findMany({
      orderBy: { name: 'asc' }
    })
    res.json(machines)
  } catch (error) {
    console.error('GET all /machines error:', error)
    res.status(500).json({ error: 'Failed to fetch machines' })
  }
})

/**
 * GET /:id
 *
 * Returns one machine by primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning the machine payload.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
router.get('/:id', async (req, res) => {
  try {
    const machine = await prisma.machine.findUnique({
      where: { id: req.params.id }
    })
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found' })
    }
    res.json(machine)
  } catch (error) {
    console.error('GET single /machines error:', error)
    res.status(500).json({ error: 'Failed to fetch machine' })
  }
})

/**
 * POST /
 *
 * Creates a machine. The optional code is persisted only when supplied because
 * the database enforces uniqueness on non-null machine codes.
 *
 * @param {import('express').Request} req - Express request with body.name and optional body.code.
 * @param {import('express').Response} res - Express response returning the created machine.
 * @returns {Promise<void>} Sends 201, 400 when name is missing, or 500 on Prisma failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when a unique machine code is duplicated.
 */
router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name is required' })
    }
    const machine = await prisma.machine.create({
      data: { name,
        ...(code !== undefined && { code }),
      }
    })
    res.status(201).json(machine)
  } catch (error) {
    console.error('POST /machines error:', error)
    res.status(500).json({ error: 'Failed to create machine' })
  }
})

/**
 * PUT /:id
 *
 * Updates mutable machine fields. The active flag supports soft deletion while
 * preserving existing production run history.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable machine fields.
 * @param {import('express').Response} res - Express response returning the updated machine.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 * @throws {Prisma.PrismaClientKnownRequestError} P2002 when an updated machine code conflicts.
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, code, active } = req.body
    const machine = await prisma.machine.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        // Soft deletion: active=false removes the machine from new work without
        // deleting rows referenced by historical ProductionRun records.
        ...(active !== undefined && { active }),
      }
    })
    res.json(machine)
  } catch (error) {
    console.error('PUT /machines error:', error)
    res.status(500).json({ error: 'Failed to update machine' })
  }
})

export default router
