import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all parameters
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

// GET single parameter by id
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

// POST create new parameter    
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

// PUT update parameter
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