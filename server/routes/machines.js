/**
 * @file machines.js
 * @description CRUD routes for Machine master data. Like operators, machines are
 * soft-deleted via `active: false` to preserve historical run references. The
 * machine↔parameter and machine↔product link management does NOT belong here —
 * see machineParameters.js and machineProducts.js.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { machineHasRunInProgress } from '../lib/machineGuards.js'

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
  const machines = await prisma.machine.findMany({
    orderBy: { name: 'asc' }
  })
  res.json(machines)
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
  const machine = await prisma.machine.findUnique({
    where: { id: req.params.id }
  })
  if (!machine) {
    return res.status(404).json({ error: 'Machine not found' })
  }
  res.json(machine)
})

/**
 * Creates a machine with an optional unique code.
 *
 * @param {import('express').Request} req - `body.name` (required); `body.code` (optional, unique when present).
 * @param {import('express').Response} res - 201 → created Machine; 400 missing name; 409 duplicate code; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/machines  { "name": "Foil line 2", "code": "FOL-02" }
 * // → 201 { id: "51aa…", name: "Foil line 2", code: "FOL-02", active: true }
 */
router.post('/', async (req, res) => {
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
})

/**
 * Partially updates a machine; `active: false` is the soft-delete path.
 *
 * @param {import('express').Request} req - `params.id` UUID; optional `body.name`, `body.code`, `body.active`.
 * @param {import('express').Response} res - 200 → updated Machine; 404 unknown id; 409 duplicate code or blocked by in-progress run; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/machines/7cd0…  { "code": "EXT-01B" }
 * // → 200 { id: "7cd0…", name: "Extruder 1", code: "EXT-01B", active: true }
 */
router.put('/:id', async (req, res) => {
  const { name, code, active } = req.body
  if (active === false && await machineHasRunInProgress(req.params.id)) {
    return res.status(409).json({ error: 'Cannot deactivate this machine while a run is in progress' })
  }
  const machine = await prisma.machine.update({
    where: { id: req.params.id },
    data: {
      // Spread-if-defined keeps omitted fields untouched (partial update).
      ...(name !== undefined && { name }),
      // Blank/whitespace normalizes to null so it never occupies the unique
      // constraint's single "" slot (see todo.md Group 3 #11).
      ...(code !== undefined && { code: code.trim() === '' ? null : code.trim() }),
      ...(active !== undefined && { active }),
    }
  })
  res.json(machine)
})

export default router
