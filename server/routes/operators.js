/**
 * @file operators.js
 * @description CRUD routes for Operator master data (the people running machines).
 * Deletion is intentionally absent — operators are soft-deleted via `active: false`
 * so historical ProductionRun rows keep a valid foreign key. UI concerns and
 * cross-entity workflows do NOT belong here.
 */
import { Router } from 'express'
import prisma from '../lib/prisma.js'
import { isNonEmptyString, normalizeName } from '../lib/validation.js'
import { lockAndAssertNoOpenRun } from '../lib/deactivationGuards.js'
import { parseActiveFilter } from '../lib/queryFilters.js'

const router = Router()

/**
 * Lists operators, optionally narrowed to active or inactive ones.
 *
 * Unfiltered by default because the admin screen needs inactive rows to offer
 * reactivation; the new-run wizard passes `?active=true`.
 *
 * @param {import('express').Request} req - Optional query: `active` ("true" | "false").
 * @param {import('express').Response} res - 200 → Operator[] sorted by name; 400 on a malformed
 * `active`; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // GET /api/operators?active=true
 * // → 200 [{ id: "b3f1…", name: "Amar", active: true }, …]
 */
router.get('/', async (req, res) => {
  const operators = await prisma.operator.findMany({
    where: { ...parseActiveFilter(req.query.active) },
    orderBy: { name: 'asc' }
  })
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
  if (!isNonEmptyString(name)) {
    return res.status(400).json({ error: 'name is required' })
  }
  const operator = await prisma.operator.create({
    data: { name: normalizeName(name) }
  })
  res.status(201).json(operator)
})

/**
 * Partially updates an operator; `active: false` is the soft-delete path.
 *
 * @param {import('express').Request} req - `params.id` UUID; `body.name` and/or `body.active`, both optional.
 * @param {import('express').Response} res - 200 → updated Operator; 400 blank or non-string name; 404 unknown id; 409 blocked by in-progress run; 500 on DB failure.
 * @returns {Promise<void>} Sends the response; resolves with nothing.
 *
 * @example
 * // PUT /api/operators/b3f1c2d4-…  { "active": false }
 * // → 200 { id: "b3f1c2d4-…", name: "Amar", active: false }
 */
router.put('/:id', async (req, res) => {
  const { name, active } = req.body
  if (name !== undefined && typeof name !== 'string') {
    return res.status(400).json({ error: 'name must be a string' })
  }
  if (active !== undefined && typeof active !== 'boolean') {
    return res.status(400).json({ error: 'active must be a boolean' })
  }
  // NOT NULL does not mean "has a name" to Postgres — "" satisfies the column
  // and leaves a row no list or dropdown can render. Same check POST makes.
  if (name !== undefined && !isNonEmptyString(name)) {
    return res.status(400).json({ error: 'name cannot be blank' })
  }
  // The guard and the update share one transaction so the row stays locked
  // between them (see lib/deactivationGuards.js). A plain
  // rename has nothing to guard and could skip the transaction, but branching
  // on that would mean two copies of the update; one code path is worth more
  // than the round trip it saves at this scale.
  const operator = await prisma.$transaction(async (tx) => {
    if (active === false) {
      await lockAndAssertNoOpenRun(tx, 'operator', req.params.id,
        'Cannot deactivate this operator while a run is in progress')
    }
    return tx.operator.update({
      where: { id: req.params.id },
      data: {
        // Spread-if-defined so omitted fields stay untouched — a plain
        // `{ name, active }` would overwrite missing fields with undefined/null.
        ...(name !== undefined && { name: normalizeName(name) }),
        ...(active !== undefined && { active }),
      }
    })
  })
  res.json(operator)
})

export default router
