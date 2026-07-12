/**
 * @file operators.js
 * @description CRUD routes for Operator master data (the people running machines).
 * Deletion is intentionally absent — operators are soft-deleted via `active: false`
 * so historical ProductionRun rows keep a valid foreign key. UI concerns and
 * cross-entity workflows do NOT belong here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'

const router = Router()

/**
 * Lists ALL operators, including inactive ones, because the admin screen needs
 * them to offer reactivation.
 *
 * @param {import('express').Request} req - No params or body used.
 * @param {import('express').Response} res - 200 → Operator[] sorted by name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/operators
 * // → 200 [{ id: "b3f1…", name: "Amar", active: true }, …]
 */
router.get('/', async (req, res) => {
  const operators = await prisma.operator.findMany({
    orderBy: { name: 'asc' }
  })
  // TODO: dropdown consumers (new-run wizard) need only active operators but
  // currently filter client-side — an unfiltered caller can still pick an
  // inactive operator. Consider ?active=true support. todo.md Group 3 #8.
  res.json(operators)
})

/**
 * Fetches one operator by primary key.
 *
 * @param {import('express').Request} req - `params.id` is the operator UUID.
 * @param {import('express').Response} res - 200 → Operator; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/operators/b3f1c2d4-…
 * // → 200 { id: "b3f1c2d4-…", name: "Amar", active: true }
 */
router.get('/:id', async (req, res) => {
  const operator = await prisma.operator.findUnique({
    where: { id: req.params.id }
  })
  if (!operator) {
    return res.status(404).json({ error: 'Operator not found' })
  }
  res.json(operator)
})

/**
 * Creates an operator from a name only — `active` defaults to true in the schema,
 * and accepting it here would let a client create pre-deactivated records.
 *
 * @param {import('express').Request} req - `body.name` (string, required).
 * @param {import('express').Response} res - 201 → created Operator; 400 missing name; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // POST /api/operators  { "name": "Emina" }
 * // → 201 { id: "9a2e…", name: "Emina", active: true }
 */
router.post('/', async (req, res) => {
  const { name } = req.body
  // TODO: "   " passes this check — trim and enforce a minimum length before
  // the database fills up with blank names. todo.md Group 3 #8.
  if (!name) {
    return res.status(400).json({ error: 'name is required' })
  }
  const operator = await prisma.operator.create({
    data: { name }
  })
  res.status(201).json(operator)
})

/**
 * Partially updates an operator; `active: false` is the soft-delete path.
 *
 * @param {import('express').Request} req - `params.id` UUID; `body.name` and/or `body.active`, both optional.
 * @param {import('express').Response} res - 200 → updated Operator; 404 unknown id; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/operators/b3f1c2d4-…  { "active": false }
 * // → 200 { id: "b3f1c2d4-…", name: "Amar", active: false }
 */
router.put('/:id', async (req, res) => {
  const { name, active } = req.body
  // TODO: deactivation is allowed even while this operator has an in_progress
  // run, which orphans the live run's context. Check for open runs before
  // accepting active: false. todo.md Group 3 #5.
  const operator = await prisma.operator.update({
    where: { id: req.params.id },
    data: {
      // Spread-if-defined so omitted fields stay untouched — a plain
      // `{ name, active }` would overwrite missing fields with undefined/null.
      ...(name !== undefined && { name }),
      ...(active !== undefined && { active }),
    }
  })
  res.json(operator)
})

export default router
