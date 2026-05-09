import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

// GET all materials
router.get('/', async (req, res) => {
    try {
        const materials = await prisma.material.findMany({
            orderBy: { name: 'asc' }
        })
        res.json(materials)
    } catch (error) {
        console.error('GET all /materials materials:', error)
        res.status(500).json({ error: 'Failed to fetch materials' })        
    }
})

// GET single material by id
router.get('/:id', async (req, res) => {
    try {
        const material = await prisma.material.findUnique({ 
            where: { id: req.params.id } 
        })
        if (!material) {
            return res.status(404).json({ error: 'Material not found' })
        }   
        res.json(material)
    } catch (error) {
        console.error('GET single /materials material:', error)
        res.status(500).json({ error: 'Failed to fetch material' })        
    }   
})

// POST create new material
router.post('/', async (req, res) => {
    try {
        const { name, unit, supplier, stockQty } = req.body
        if (!name || !unit) {
            return res.status(400).json({ error: 'name and unit are required' })
        }
        const material = await prisma.material.create({
            data: { name, unit,
                ...(supplier !== undefined && { supplier }),
                ...(stockQty !== undefined && { stockQty })
            }
        })
        res.status(201).json(material)
    } catch (error) {
        console.error('POST /materials material:', error)
        res.status(500).json({ error: 'Failed to create material' })        
    }       
})

// PUT update material
router.put('/:id', async (req, res) => {
    try {   
        const { name, unit, supplier, stockQty } = req.body
        const material = await prisma.material.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(unit !== undefined && { unit }),
                ...(supplier !== undefined && { supplier }),
                ...(stockQty !== undefined && { stockQty })
            }
        })
        res.json(material)
    } catch (error) {
        console.error('PUT /materials material:', error)
        res.status(500).json({ error: 'Failed to update material' })
    }   
})

export default router   