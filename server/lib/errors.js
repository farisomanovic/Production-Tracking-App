/**
 * @file errors.js
 * @description Custom error classes routes can throw to get a specific status
 * code out of the central error middleware (see middleware/errorHandler.js)
 * instead of hand-mapping status codes themselves.
 */

export class AppError extends Error {
    constructor(status, message) {
        super(message)
        this.status = status
    }
}

// Thrown inside productionRuns.js's $transaction callbacks to signal business
// outcomes (as opposed to genuine DB/transaction failures) up to the central
// error middleware. Throwing aborts the transaction, so nothing partial is
// ever committed.
export class RunNotFoundError extends AppError {
    constructor(message = 'Production run not found') {
        super(404, message)
    }
}

export class RunAlreadyCompletedError extends AppError {
    constructor(message = 'Production run is already completed') {
        super(409, message)
    }
}

export class UnknownMaterialError extends AppError {
    constructor(message = 'One of the materials in materialUsages does not exist') {
        super(400, message)
    }
}

export class InsufficientStockError extends AppError {
    constructor(message) {
        super(409, message)
    }
}

// Detects a foreign key constraint violation. Prisma's own P2003 covers Prisma-
// enforced relations; a DELETE blocked by an `onDelete: Restrict` relation (e.g.
// MachineParameter still referenced by RunParameterValue) is enforced by Postgres
// itself and surfaces as an unrecognized PrismaClientUnknownRequestError instead.
// Prefer the embedded Postgres SQLSTATE code (23001 restrict_violation / 23503
// foreign_key_violation — part of the SQL standard, unaffected by message wording
// or locale) and fall back to matching the English phrase only if the code isn't
// present in the message. This is the best signal available today — Prisma doesn't
// expose a stable code for this error class — so it fails safe (falls through to a
// 500, not a wrong status) if a future Prisma version reformats the message.
// Re-verify this detection after any Prisma major-version upgrade (todo.md Group 8).
export function isForeignKeyViolation(err) {
    const sqlState = err.message?.match(/"code":\s*"(\d{5})"/)?.[1]
    return err.code === 'P2003' ||
        (err.name === 'PrismaClientUnknownRequestError' &&
            (sqlState === '23001' || sqlState === '23503' || /foreign key constraint/i.test(err.message)))
}
