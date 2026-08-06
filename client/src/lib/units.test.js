/**
 * @file units.test.js
 * @description Drift guard for the one constant this repo duplicates across the
 * client/server boundary.
 *
 * `UNITS` is a copy of the server's `VALID_UNITS`. todo.md Group 8 #31 catalogues
 * what happens to copies here: `RUNS_FETCH_LIMIT` ↔ `MAX_TAKE` and the two
 * `PERCENT_TOLERANCE`s both carry a "keep in sync" comment and nothing else, so if
 * either pair drifts nothing fails — the app just quietly starts disagreeing with
 * itself. A comment is a note to a human who may never read it; a test is a note to
 * a machine that reads it on every commit.
 *
 * The concrete failure this catches: someone adds a unit to `VALID_UNITS` to fix a
 * 400, ships it, and the dropdown never offers the new option — so the server now
 * accepts a value no user can select. That is silent, and it is exactly the shape of
 * bug that put #34 on the list in the first place.
 *
 * The import reaches outside `client/` into `server/lib/validation.js`. That is the
 * first cross-package import in the repo and a deliberate concession: the rule being
 * guarded spans both packages, so the guard has to as well. It works because
 * validation.js is dependency-free ESM and this suite runs in a node environment
 * (vitest.config.js). Group 5 #15 deletes both this test and units.js by making the
 * enum generated.
 */
import { describe, it, expect } from 'vitest'
import { UNITS } from './units'
import { VALID_UNITS } from '../../../server/lib/validation.js'

describe('UNITS', () => {
  // Order matters as much as membership: UNITS is rendered straight into the
  // dropdown, so a reordering is a visible UI change that should be a deliberate
  // edit on both sides rather than a side effect of touching the server.
  it('matches the server vocabulary exactly', () => {
    expect(UNITS).toEqual(VALID_UNITS)
  })

  // Guards the assertion above against passing vacuously: two arrays that are both
  // empty are also "equal", and an import that silently resolved to undefined would
  // take the whole guard down with it.
  it('is a non-empty array of strings', () => {
    expect(UNITS.length).toBeGreaterThan(0)
    expect(UNITS.every(u => typeof u === 'string' && u.length > 0)).toBe(true)
  })
})
