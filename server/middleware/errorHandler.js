/**
 * @file errorHandler.js
 * @description Central Express error-handling middleware — the single place
 * that turns a thrown/rejected error into an HTTP response. Registered LAST in
 * app.js (Express only treats 4-arg functions as error handlers). Express 5
 * auto-forwards both thrown errors and rejected promises from async route
 * handlers here, so routes no longer need their own try/catch for the generic
 * case — only for errors they want to translate into a specific AppError.
 */
import { AppError, isForeignKeyViolation } from '../lib/errors.js'

// eslint-disable-next-line no-unused-vars
export default function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        return res.status(err.status).json({ error: err.message })
    }

    // Unique constraint violation (e.g. a duplicate code/name). A route can
    // tag the error with a friendlier, resource-specific message before
    // forwarding it here (see machineParameters.js/machineProducts.js) — the
    // status is always 409 regardless, so routes never need to restate it.
    if (err.code === 'P2002') {
        return res.status(409).json({ error: err.clientMessage || 'A record with this value already exists' })
    }

    // Foreign key constraint violation. Prisma doesn't distinguish direction,
    // so infer from the HTTP method: a blocked DELETE means "still referenced
    // elsewhere" (409 Conflict); a failed create/update means the request
    // pointed at a reference that doesn't exist (400 Bad Request). A route can
    // tag a friendlier, resource-specific message before forwarding a blocked
    // DELETE here (see machineParameters.js), same as the P2002 branch above.
    if (isForeignKeyViolation(err)) {
        if (req.method === 'DELETE') {
            return res.status(409).json({ error: err.clientMessage || 'This record is still referenced elsewhere and cannot be removed' })
        }
        return res.status(400).json({ error: 'One or more referenced records do not exist' })
    }

    // Record not found for an update/delete Prisma expected to match a row.
    if (err.code === 'P2025') {
        return res.status(404).json({ error: 'Record not found' })
    }

    // Errors thrown by Express's own middleware (e.g. express.json() on
    // malformed JSON, or an unsupported content type) already carry the right
    // status via http-errors' err.status/err.statusCode — a central handler
    // must not regress the status-awareness Express's own default handler had.
    const expressStatus = err.status || err.statusCode
    if (typeof expressStatus === 'number' && expressStatus >= 400 && expressStatus < 500) {
        return res.status(expressStatus).json({ error: 'Malformed request' })
    }

    // Only reached for errors nothing above recognized — matching the
    // pre-refactor convention where routes only console.error'd truly
    // unexpected failures, not routine, already-classified 4xx outcomes
    // (a double-completed run, a duplicate code, a stock conflict). Keep
    // this the last statement in the function: anything added below it
    // would silently stop being logged on this fallback path.
    console.error(`${req.method} ${req.originalUrl}:`, err)
    res.status(500).json({ error: 'Something went wrong' })
}
