/**
 * @file machines.js
 * @description CRUD routes for Machine master data. Like operators, machines are
 * soft-deleted via `active: false` to preserve historical run references. The
 * machine↔parameter and machine↔product link management does NOT belong here —
 * see machineParameters.js and machineProducts.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists ALL machines, including inactive ones, for the admin screen's
 * activate/deactivate toggle.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Machine[] sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/machines
 * // → 200 [{ id: "7cd0…", name: "Extruder 1", code: "EXT-01", active: true }]
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
 * Fetches one machine by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the machine UUID.
 * @param {import('express').Response} res - 200 → Machine; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/machines/7cd0…
 * // → 200 { id: "7cd0…", name: "Extruder 1", code: "EXT-01", active: true }
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
 * Creates a machine with an optional unique code.
 *
 * @param {import('express').Request} req - `body.name` (required); `body.code` (optional, unique when present).
 * @param {import('express').Response} res - 201 → created Machine; 400 missing name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/machines  { "name": "Foil line 2", "code": "FOL-02" }
 * // → 201 { id: "51aa…", name: "Foil line 2", code: "FOL-02", active: true }
 */
router.post('/', async (req, res) => {
  try {
    const { name, code } = req.body
    if (!name) {
      return res.status(400).json({ error: 'name is required' })
    }
    const machine = await prisma.machine.create({
      // code is only included when the client sent it: the column is nullable
      // with a unique constraint, and Postgres treats NULLs as distinct — so
      // omitting it allows many code-less machines, while an explicit duplicate
      // string would violate the constraint.
      data: { name,
        ...(code !== undefined && { code }),
      }
    })
    res.status(201).json(machine)
  } catch (error) {
    // TODO: a duplicate code arrives here as Prisma P2002 and becomes a 500 —
    // should be a 409 with a "code already in use" message. todo.md Group 4 #5.
    console.error('POST /machines error:', error)
    res.status(500).json({ error: 'Failed to create machine' })
  }
})

/**
 * Partially updates a machine; `active: false` is the soft-delete path.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.code`, `body.active`.
 * @param {import('express').Response} res - 200 → updated Machine; 500 on failure (including unknown id or duplicate code).
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/machines/7cd0…  { "code": "EXT-01B" }
 * // → 200 { id: "7cd0…", name: "Extruder 1", code: "EXT-01B", active: true }
 */
router.put('/:id', async (req, res) => {
  try {
    const { name, code, active } = req.body
    const machine = await prisma.machine.update({
      where: { id: req.params.id },
      data: {
        // Spread-if-defined keeps omitted fields untouched (partial update).
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
        ...(active !== undefined && { active }),
      }
    })
    res.json(machine)
  } catch (error) {
    // TODO: P2025 (unknown id) and P2002 (duplicate code) both collapse to 500
    // here — should be 404 and 409. todo.md Group 4 #5.
    // TODO: deactivation is allowed while a run is in progress on this machine.
    // todo.md Group 3 #5.
    console.error('PUT /machines error:', error)
    res.status(500).json({ error: 'Failed to update machine' })
  }
})

export default router
