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

// Blank/whitespace normalizes to null so it never occupies a unique
// constraint's single "" slot; explicit null passes through instead of
// hitting .trim() on null.
export function normalizeCode(code) {
    if (code === null) return null
    return code.trim() === '' ? null : code.trim()
}
