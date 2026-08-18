/**
 * @file queryFilters.js
 * @description Parsers turning raw Express query-string values into Prisma
 * `where` fragments. One function per filter, each responsible for rejecting a
 * malformed value BEFORE it can reach Prisma — where an unexpected shape stops
 * being a 400 and becomes a 500.
 */
import { AppError } from './errors.js'

/**
 * Parses the `?active=` filter shared by every master-data list endpoint.
 *
 * The list endpoints serve two audiences with opposite needs: selection
 * dropdowns must offer only active rows, while the admin pages must see
 * inactive ones to offer reactivation. A caller-supplied filter is what lets
 * one endpoint do both — the alternative was the `.filter(x => x.active)` that
 * every consumer had to remember to write for itself.
 *
 * @param {unknown} value - Raw `req.query.active`; `undefined` when absent, and
 * an ARRAY when the key is repeated (`?active=true&active=false`), which is why
 * the string check below is not redundant.
 * @returns {{ active?: boolean }} A fragment to spread into a Prisma `where`;
 * `{}` when the filter is absent, so spreading it is always safe.
 * @throws {AppError} 400 on a repeated key or any value other than 'true'/'false'.
 *
 * @example
 * // GET /api/materials?active=true
 * const where = { ...parseActiveFilter(req.query.active) }  // → { active: true }
 */
export function parseActiveFilter(value) {
    if (value === undefined) {
        return {}
    }
    // Express turns a repeated query key into an array — same defence as the
    // shape loop in productionRuns.js's GET, kept here so all eight endpoints
    // that accept this filter get it without restating it.
    if (typeof value !== 'string') {
        throw new AppError(400, 'active must be a single value')
    }
    // An allow-list of exactly two strings rather than JS truthiness: `?active=0`
    // and `?active=no` both read as "give me the inactive ones" to a human and
    // as `true` to Boolean(), and a filter that silently returns the opposite of
    // what was asked is worse than one that refuses.
    if (value !== 'true' && value !== 'false') {
        throw new AppError(400, "active must be either 'true' or 'false'")
    }
    return { active: value === 'true' }
}
