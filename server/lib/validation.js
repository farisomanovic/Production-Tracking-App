/**
 * @file validation.js
 * @description Small, dependency-free validation predicates shared across
 * route modules — id-array shape checks that would otherwise be hand-rolled
 * per route.
 */

export function hasDuplicates(ids) {
    return new Set(ids).size !== ids.length
}

export function allBelongTo(ids, validSet) {
    return ids.every(id => validSet.has(id))
}

export function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v)
}

// Required-string check: rejects non-strings and blank/whitespace-only values
// alike, so a numeric field crashing Prisma and an empty field both land on
// the same "X is required" message a caller already expects.
export function isNonEmptyString(v) {
    return typeof v === 'string' && v.trim().length > 0
}

// Blank/whitespace normalizes to null so it never occupies a unique
// constraint's single "" slot; explicit null passes through instead of
// hitting .trim() on null.
export function normalizeCode(code) {
    if (code === null) return null
    return code.trim() === '' ? null : code.trim()
}

// name is required (unlike code), so callers keep their own presence/blank
// guard — this only normalizes whitespace. Non-string input passes through
// unchanged: making non-strings a hard error is the callers' type-guard job,
// not this one's.
export function normalizeName(name) {
    if (typeof name !== 'string') return name
    return name.trim().replace(/\s+/g, ' ')
}

// Optional free text (supplier, description, notes, potentialBuyer,
// Parameter.unit). None of these has a unique constraint to protect, which is
// why they went unnormalized for so long — but several are de facto GROUPING
// keys: " PakOm" and "PakOm " render identically in a dropdown and in the XLSX
// export, and will never group together. Same normalize-then-null shape as
// normalizeCode above, and for the same reason: a field the user cleared should
// end up as one value (null), not as any of "", " ", or "\n".
// Non-string input passes through unchanged — the callers' typeof guard owns
// that message, same division of labour as normalizeName. That also covers
// null and undefined without a special case: null normalizes to itself, and
// undefined stays undefined so the callers' spread-if-defined still skips it.
export function normalizeOptionalText(value) {
    if (typeof value !== 'string') return value
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
}

// Product.unit and Material.unit are meant to be a closed vocabulary, not
// free text — callers already type-check unit before this runs, so exact
// case-sensitive membership is the only thing left to enforce.
export const VALID_UNITS = ['kg', 'm', 'roll', 'pcs']

export function isValidUnit(v) {
    return VALID_UNITS.includes(v)
}

// ProductionRun.status is a raw String column, so this array is the only
// authority on the vocabulary — the schema cannot reject "compleeted" and
// neither can Postgres. It is hand-written for exactly as long as that stays
// true: Group 5 #4 turns the column into a Prisma enum, at which point this
// becomes Object.values(RunStatus) and the pair below is deleted.
export const VALID_STATUSES = ['in_progress', 'completed']

export function isValidStatus(v) {
    return VALID_STATUSES.includes(v)
}
