import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all operators
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

// GET single operator by id
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

// POST create new operator
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

// PUT update operator
router.put('/:id', async (req, res) => {
  try {
    const { name, active } = req.body
    const operator = await prisma.operator.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
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