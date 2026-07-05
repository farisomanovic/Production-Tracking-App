/**
 * @file machineParameters.js
 * @description Routes for the Machine↔Parameter link table: which measurements a
 * machine collects and in what form order (displayOrder). Parameter definitions
 * themselves do NOT belong here — see parameters.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists a machine's parameter links, parameter metadata included, in the order
 * the run-entry form should render them.
 *
 * @param {import('express').Request} req - `params.machineId` is the machine UUID.
 * @param {import('express').Response} res - 200 → MachineParameter[] (with `parameter`) ordered by displayOrder; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/machine-parameters/machine/7cd0…
 * // → 200 [{ id: "31f0…", displayOrder: 0, parameter: { name: "Melt temp", unit: "°C" } }]
 */
router.get('/machine/:machineId', async (req, res) => {
    try {
        const links = await prisma.machineParameter.findMany({
            where: { machineId: req.params.machineId },
            // displayOrder is the single source of truth for form field order —
            // the wizard, the completion form, and run detail all rely on it so
            // the operator always sees fields in the same sequence.
            orderBy: { displayOrder: 'asc' },
            include: {
                parameter: true
            }
        })
        res.json(links)
    } catch (error) {
        console.error('GET all parameters for a specific machine /machine-parameters/machine/:machineId error:', error)
        res.status(500).json({ error: 'Failed to fetch machine parameters' })
    }
})

/**
 * Links a parameter to a machine, appending it to the end of the form when no
 * explicit displayOrder is given.
 *
 * @param {import('express').Request} req - `body.machineId`, `body.parameterId` (required); `body.displayOrder` (optional).
 * @param {import('express').Response} res - 201 → created link (with `parameter`); 400 missing ids or duplicate link; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/machine-parameters  { "machineId": "7cd0…", "parameterId": "e01b…" }
 * // → 201 { id: "31f0…", displayOrder: 3, parameter: { name: "Melt temp" } }
 */
router.post('/', async (req, res) => {
    try {
        const { machineId, parameterId, displayOrder } = req.body
        if (!machineId || !parameterId) {
        return res.status(400).json({ error: 'machineId and parameterId are required' })
        }

        let finalDisplayOrder = displayOrder

        if (finalDisplayOrder === undefined) {
            // "Highest existing + 1" so a new parameter lands at the bottom of the
            // form instead of colliding with position 0.
            const existing = await prisma.machineParameter.findMany({
                where: { machineId },
                orderBy: { displayOrder: 'desc' },
                take: 1
            })
            // TODO: read-then-write race — two concurrent inserts can compute the
            // same "last + 1" and one will hit @@unique([machineId, displayOrder])
            // as an unmapped 500. Rare with one admin user, but real.
            finalDisplayOrder = existing.length > 0 ? existing[0].displayOrder + 1 : 0
        }

        const link = await prisma.machineParameter.create({
        data: {
            machineId,
            parameterId,
            displayOrder: finalDisplayOrder
        },
        include: {
            parameter: true
        }
        })
        res.status(201).json(link)
    } catch (error) {
        // P2002 here means either unique pair (already linked) or unique
        // displayOrder collided — both surface as the friendlier duplicate message.
        if (error.code === 'P2002') {
        return res.status(400).json({ error: 'This parameter is already linked to this machine' })
        }
        console.error('POST link a parameter to a machine /machine-parameters error:', error)
        res.status(500).json({ error: 'Failed to link parameter to machine' })
    }
})

/**
 * Changes one link's displayOrder (form position).
 *
 * @param {import('express').Request} req - `params.id` link UUID; `body.displayOrder` (required integer).
 * @param {import('express').Response} res - 200 → updated link (with `parameter`); 400 missing displayOrder; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/machine-parameters/31f0…  { "displayOrder": 1 }
 * // → 200 { id: "31f0…", displayOrder: 1, parameter: { name: "Melt temp" } }
 */
router.put('/:id', async (req, res) => {
    try {
        const { displayOrder } = req.body
        if (displayOrder === undefined) {
            return res.status(400).json({ error: 'displayOrder is required' })
        }
        // TODO: swapping two rows is impossible with @@unique([machineId,
        // displayOrder]) — the first update collides with the other row's value
        // and P2002 falls through to a 500 (not mapped here). No UI calls this
        // endpoint yet, likely for that reason. See todo.md Group 5 #2.
        const link = await prisma.machineParameter.update({
            where: { id: req.params.id },
            data: { displayOrder },
            include: {
                parameter: true
            }
        })
        res.json(link)
    } catch (error) {
        console.error('PUT update displayOrder of a link /machine-parameters/:id error:', error)
        res.status(500).json({ error: 'Failed to update machine parameter' })
    }
})

/**
 * Unlinks a parameter from a machine by link-table primary key.
 *
 * @param {import('express').Request} req - `params.id` is the MachineParameter link UUID (not the parameter id).
 * @param {import('express').Response} res - 200 → confirmation message; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // DELETE /api/machine-parameters/31f0…
 * // → 200 { message: "Parameter unlinked from machine successfully" }
 */
router.delete('/:id', async (req, res) => {
    try {
        // TODO: once any completed run recorded a value for this link,
        // RunParameterValue's RESTRICT foreign key makes this delete throw P2003 —
        // which lands in catch as a bare 500. Map it to a 409 with a clear
        // "has recorded history" message. todo.md Group 4 #3.
        await prisma.machineParameter.delete({
            where: { id: req.params.id }
        })
        res.json({ message: 'Parameter unlinked from machine successfully' })
    } catch (error) {
        console.error('DELETE unlink a parameter from a machine /machine-parameters/:id error:', error)
        res.status(500).json({ error: 'Failed to unlink parameter from machine' })
    }
})
export default router
