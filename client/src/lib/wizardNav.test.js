/**
 * @file wizardNav.test.js
 * @description Guards `canGoBack` — the whole executable part of the fix that
 * stopped the wizard offering a Back button on step 3.
 *
 * What made that button harmful is invisible from the button itself: step 2's
 * "Next" always POSTs a new run, so returning to step 2 from step 3 and
 * continuing created a *second* `in_progress` row and orphaned the first, which
 * the wizard could then neither complete nor cancel. The rendering site is JSX
 * and this suite runs with `environment: 'node'` and no jsdom, so the predicate
 * below is the only surface a test can reach — and the step-3 case is the one
 * that must never silently flip back to true.
 */
import { describe, it, expect } from 'vitest'
import { canGoBack } from './wizardNav'

describe('canGoBack', () => {
  // The bug this fix exists for. Back here led to step 2, whose Next re-runs
  // handleCreateRun against a run that already exists.
  it('refuses to leave step 3, where Back would lead back into run creation', () => {
    expect(canGoBack(3, 'run-1', false)).toBe(false)
  })

  it('allows step 2 to return to step 1 before the run is created', () => {
    expect(canGoBack(2, null, false)).toBe(true)
  })

  // Unreachable through the UI now that step 3 has no Back — kept because it is
  // the invariant the whole fix rests on, not merely one route to violating it.
  it('refuses to leave step 2 once the run exists', () => {
    expect(canGoBack(2, 'run-1', false)).toBe(false)
  })

  // The window between clicking Next on step 2 and the POST resolving: runId is
  // still null, but a run is being created, so step 1 is no longer editable.
  it('refuses to leave step 2 while the run is being created', () => {
    expect(canGoBack(2, null, true)).toBe(false)
  })

  it('has nowhere to go back to from step 1', () => {
    expect(canGoBack(1, null, false)).toBe(false)
  })

  // Steps 4 and 5 only mutate local wizard state — Step5_Output's "press Back to
  // change it" hint depends on this staying true.
  it('allows stepping back within steps 4 and 5', () => {
    expect(canGoBack(4, 'run-1', false)).toBe(true)
    expect(canGoBack(5, 'run-1', false)).toBe(true)
  })
})
