import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all machines in display order.
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
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, code, active } = req.body
    const machine = await prisma.machine.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
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
