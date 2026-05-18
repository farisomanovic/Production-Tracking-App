/**
 * Handles Material API routes for consumed production inputs.
 * Tracks units, suppliers, and current stock quantity.
 * Supplies recipe composition and run material-usage workflows.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * GET /
 *
 * Returns all materials in display order, including current stock quantities.
 *
 * @param {import('express').Request} req - Express request; no query parameters are required.
 * @param {import('express').Response} res - Express response returning material records.
 * @returns {Promise<void>} Sends 200 with materials or 500 on Prisma read failure.
 */
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

/**
 * GET /:id
 *
 * Returns one material by primary key.
 *
 * @param {import('express').Request} req - Express request containing params.id.
 * @param {import('express').Response} res - Express response returning a material record.
 * @returns {Promise<void>} Sends 200, 404 when missing, or 500 on database failure.
 */
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

/**
 * POST /
 *
 * Creates a material master record. Optional supplier and stock values are
 * stored only when supplied by the client.
 *
 * @param {import('express').Request} req - Express request with required name/unit and optional supplier/stockQty.
 * @param {import('express').Response} res - Express response returning the created material.
 * @returns {Promise<void>} Sends 201, 400 when required fields are missing, or 500 on Prisma failure.
 */
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

/**
 * PUT /:id
 *
 * Updates material metadata or the current stock quantity.
 *
 * @param {import('express').Request} req - Express request containing params.id and mutable material fields.
 * @param {import('express').Response} res - Express response returning the updated material.
 * @returns {Promise<void>} Sends 200 or 500 on update failure.
 */
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
