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
