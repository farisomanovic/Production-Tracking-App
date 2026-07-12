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
