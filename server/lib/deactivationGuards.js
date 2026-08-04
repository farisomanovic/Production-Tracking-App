/**
 * @file deactivationGuards.js
 * @description The soft-delete guard for the three entities a ProductionRun
 * points at: an operator/machine/recipe must not be deactivated while an
 * in_progress run still references it.
 *
 * Why this is a lock and not just a query (todo.md Group 4 #8): the guard and
 * POST /production-runs' own `active` check used to be plain check-then-write
 * against tables the other one writes, so an interleaving let BOTH pass and
 * produced an in_progress run referencing an inactive parent — a state neither
 * route allows on its own, and one with no database backstop (unlike the
 * busy-machine race, which ProductionRun_one_in_progress_per_machine catches).
 * Taking the row lock BEFORE reading ProductionRun is what closes it: the
 * ordering is the fix, not the lock by itself. Under READ COMMITTED every
 * statement takes a fresh snapshot, so the read issued after the lock is
 * granted sees whatever the blocking transaction committed.
 *
 * The counterpart lock lives in productionRuns.js's POST — see the comment
 * there for why that side uses the weaker FOR SHARE.
 */
import { AppError } from './errors.js'

// Table names are spelled out per entity rather than interpolated: $queryRaw
// parameterizes values, not identifiers, so a dynamic table name would mean
// raw string concatenation into SQL.
const GUARDS = {
    operator: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Operator" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: { operatorId: id, status: 'in_progress' },
            select: { id: true }
        })
    },
    machine: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Machine" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: { machineId: id, status: 'in_progress' },
            select: { id: true }
        })
    },
    recipe: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Recipe" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: { recipeId: id, status: 'in_progress' },
            select: { id: true }
        })
    }
}

/**
 * Locks one master-data row, then refuses the caller's pending deactivation if
 * an in_progress run references it. Must be called inside an interactive
 * transaction that also performs the update — the lock is only held until that
 * transaction commits.
 *
 * @param {import('@prisma/client').Prisma.TransactionClient} tx - The transaction client.
 * @param {'operator'|'machine'|'recipe'} entity - Which guard to apply.
 * @param {string} id - The row's UUID.
 * @param {string} message - The 409 message shown to the client.
 * @returns {Promise<void>} Resolves when the row is locked and clear; throws AppError(409) otherwise.
 * @throws {AppError} 409 when an in_progress run still references the row.
 */
export async function lockAndAssertNoOpenRun(tx, entity, id, message) {
    const { lock, openRun } = GUARDS[entity]
    // An unknown id locks nothing and is deliberately NOT rejected here: the
    // caller's update then raises P2025, which the central error middleware
    // already turns into the 404 this route has always returned. Throwing a
    // second, differently-worded 404 from here would be a behaviour change.
    const locked = await lock(tx, id)
    if (locked.length === 0) {
        return
    }
    if (await openRun(tx, id)) {
        // 409, not 400: this rejects because of a conflicting CURRENT state (a
        // run in progress), not bad input.
        throw new AppError(409, message)
    }
}
