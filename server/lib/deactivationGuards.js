/**
 * @file deactivationGuards.js
 * @description The soft-delete guard for the master-data entities an
 * in_progress ProductionRun depends on: none of them may be deactivated while
 * a run that needs them is still open.
 *
 * Why this is a lock and not just a query: the guard and
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
 *
 * ─── The four DIRECT guards vs. the two INDIRECT ones ───────────────────────
 *
 * operator/machine/recipe/product are direct ProductionRun foreign keys, and
 * POST /production-runs takes a matching FOR SHARE lock on each of those four
 * rows. Lock conflicts with lock, so those four are fully closed as described
 * above.
 *
 * material and parameter are NOT. Neither is referenced by ProductionRun; they
 * are reached by joining out (Recipe → RecipeItem, and Machine →
 * MachineParameter), and run creation never reads or locks either table — so
 * there is nothing for the FOR UPDATE below to conflict WITH. The lock still
 * serializes two concurrent deactivations of the same row, but a run created in
 * the same instant as a deactivation can still slip through, leaving an open run
 * whose recipe names a deactivated material.
 *
 * That residual race is ACCEPTED, in the same spirit as the read-then-act race
 * documented at machineProducts.js's DELETE. Closing it would mean taking one
 * FOR SHARE lock per recipe material inside the run-creation transaction — the
 * highest-risk code path in the app — to defend a window a few milliseconds wide
 * against an admin action performed a handful of times a year. The consequence
 * if it ever does happen is mild and self-correcting: /complete deliberately
 * does not re-check `active` on materials, so the open run still completes and
 * consumes stock normally. Nothing is corrupted; a retired material is simply
 * used one last time.
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
    },
    product: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Product" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: { productId: id, status: 'in_progress' },
            select: { id: true }
        })
    },
    // Indirect: an open run names a Recipe, and the Recipe's items name
    // materials. See the file header for why the lock does not fully close
    // this one's race the way the four direct guards' locks do.
    material: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Material" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: {
                status: 'in_progress',
                recipe: { recipeItems: { some: { materialId: id } } }
            },
            select: { id: true }
        })
    },
    // Indirect, and for a different reason than material: RunParameterValue
    // rows are not written until /complete, so an in_progress run does not
    // reference a Parameter at all yet. What makes deactivation wrong here is
    // that the run's machine is CONFIGURED to collect this measurement and the
    // operator is about to be asked for it — the same "is this machine busy?"
    // question machineParameters.js's DELETE already refuses on.
    parameter: {
        lock: (tx, id) => tx.$queryRaw`SELECT "id" FROM "Parameter" WHERE "id" = ${id} FOR UPDATE`,
        openRun: (tx, id) => tx.productionRun.findFirst({
            where: {
                status: 'in_progress',
                machine: { machineParameters: { some: { parameterId: id } } }
            },
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
 * @param {'operator'|'machine'|'recipe'|'product'|'material'|'parameter'} entity - Which guard to apply.
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
