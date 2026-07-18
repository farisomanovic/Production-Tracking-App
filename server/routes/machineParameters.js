/**
 * @file machineParameters.js
 * @description Routes for the Machine↔Parameter link table: which measurements a
 * machine collects and in what form order (displayOrder). Parameter definitions
 * themselves do NOT belong here — see parameters.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { machineHasRunInProgress } from '../lib/machineGuards.js'
import { isForeignKeyViolation } from '../lib/errors.js'

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
})

/**
 * Links a parameter to a machine, appending it to the end of the form when no
 * explicit displayOrder is given.
 *
 * @param {import('express').Request} req - `body.machineId`, `body.parameterId` (required); `body.displayOrder` (optional).
 * @param {import('express').Response} res - 201 → created link (with `parameter`); 400 missing ids; 409 duplicate link; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/machine-parameters  { "machineId": "7cd0…", "parameterId": "e01b…" }
 * // → 201 { id: "31f0…", displayOrder: 3, parameter: { name: "Melt temp" } }
 */
router.post('/', async (req, res, next) => {
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
        // Status (409) is the central error middleware's call, not this route's.
        if (error.code === 'P2002') {
            error.clientMessage = 'This parameter is already linked to this machine'
        }
        next(error)
    }
})

/**
 * Changes one link's displayOrder (form position).
 *
 * @param {import('express').Request} req - `params.id` link UUID; `body.displayOrder` (required integer).
 * @param {import('express').Response} res - 200 → updated link (with `parameter`); 400 missing displayOrder; 404 unknown link id; 409 displayOrder collision; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/machine-parameters/31f0…  { "displayOrder": 1 }
 * // → 200 { id: "31f0…", displayOrder: 1, parameter: { name: "Melt temp" } }
 */
router.put('/:id', async (req, res) => {
    const { displayOrder } = req.body
    if (displayOrder === undefined) {
        return res.status(400).json({ error: 'displayOrder is required' })
    }
    // TODO: swapping two rows is impossible with @@unique([machineId,
    // displayOrder]) — the first update collides with the other row's value
    // and P2002 now cleanly 409s instead of a raw 500, but the swap itself
    // still can't succeed in one call. No UI calls this endpoint yet, likely
    // for that reason. See todo.md Group 5 #2.
    const link = await prisma.machineParameter.update({
        where: { id: req.params.id },
        data: { displayOrder },
        include: {
            parameter: true
        }
    })
    res.json(link)
})

/**
 * Unlinks a parameter from a machine by link-table primary key.
 *
 * @param {import('express').Request} req - `params.id` is the MachineParameter link UUID (not the parameter id).
 * @param {import('express').Response} res - 200 → confirmation message; 404 unknown link id;
 * 409 if run history references this link, or if the machine has a run in progress; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // DELETE /api/machine-parameters/31f0…
 * // → 200 { message: "Parameter unlinked from machine successfully" }
 */
router.delete('/:id', async (req, res, next) => {
    const link = await prisma.machineParameter.findUnique({
        where: { id: req.params.id },
        select: { machineId: true }
    })
    // 409, not 400: this rejects because of a conflicting CURRENT state (a run
    // in progress), not bad input — matches how a history-referenced delete
    // already 409s via P2003 below. Known residual race: this is a plain
    // read-then-act, not transaction-wrapped, so a run created in the gap
    // between this check and the delete below could still slip through.
    if (link && await machineHasRunInProgress(link.machineId)) {
        return res.status(409).json({ error: 'Cannot unlink this parameter while the machine has a run in progress' })
    }
    try {
        // Once any completed run recorded a value for this link,
        // RunParameterValue's RESTRICT foreign key makes this delete throw —
        // tag a friendlier message before the central error middleware maps it
        // to 409 (DELETE → "still referenced" reading).
        await prisma.machineParameter.delete({
            where: { id: req.params.id }
        })
        res.json({ message: 'Parameter unlinked from machine successfully' })
    } catch (error) {
        if (isForeignKeyViolation(error)) {
            error.clientMessage = 'This parameter has recorded run values and cannot be removed'
        }
        next(error)
    }
})
export default router
