/**
 * @file wizardNav.js
 * @description Decides whether the new-run wizard may step backwards from where
 * it currently is.
 *
 * The rule this file exists for: step 2 is the wizard's commit point. Its "Next"
 * runs `handleCreateRun`, which POSTs a new `in_progress` run unconditionally —
 * it has no "a run already exists" branch, and `setRunId` overwrites whatever ID
 * was there. So re-entering step 2 after it has fired does not edit the run that
 * exists; it mints a second one and orphans the first, which the wizard can no
 * longer reach, cancel or complete. Backwards movement is therefore safe only on
 * the far side of that commit (steps 4-5, which touch no server state) and on the
 * near side of it (step 2 → 1, before the POST).
 *
 * This lives in lib/ rather than inline in NewRunPage because the client suite
 * runs with `environment: 'node'` and no jsdom (client/vitest.config.js): a
 * predicate embedded in a JSX render condition cannot be asserted on at all. Same
 * reasoning that produced quantity.js and materialSplit.js.
 */

/**
 * Whether the wizard may move one step back from `currentStep`.
 *
 * Consumed twice in NewRunPage — once to decide whether the Back button renders,
 * once inside the click handler — so the button's presence and its behaviour can
 * never disagree.
 *
 * @param {number} currentStep - The step now on screen (1-5).
 * @param {string|null} runId - The created run's ID, or null before step 2's POST.
 * @param {boolean} isSubmitting - Whether that POST is currently in flight.
 * @returns {boolean} True only when stepping back cannot re-run run creation.
 *
 * @example
 * canGoBack(2, null, false)      // true  — nothing created yet, step 1 is editable
 * canGoBack(3, 'a9d2…', false)   // false — Back here would lead to a second run
 * canGoBack(4, 'a9d2…', false)   // true  — steps 4-5 are local wizard state only
 */
export function canGoBack(currentStep, runId, isSubmitting) {
    if (currentStep <= 1) return false

    // The near side of the commit: step 1 is still editable, but not while the
    // POST it triggered is in flight, and not once that POST has landed.
    if (currentStep === 2) return !isSubmitting && runId == null

    // The commit point is behind us and step 2 is not re-enterable.
    if (currentStep === 3) return false

    return true
}
