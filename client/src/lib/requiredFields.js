/**
 * @file requiredFields.js
 * @description Builds the "you left something blank" sentence that the admin
 * create/link forms show instead of doing nothing.
 *
 * Every one of those handlers used to open with a bare `return` on a missing
 * field: no message, no request, no visual change at all. Silence is ambiguous
 * between "the button is broken", "the app is frozen", "my click missed" and
 * "the form is incomplete" — only the last is true, and it is the only one the
 * user can act on.
 *
 * The sentence-building lives here rather than inline in each page because
 * client/vitest.config.js runs `environment: 'node'` with no jsdom: a string
 * assembled inside a component is unreachable by any test this repo can
 * currently run. Same reason wizardNav.js, quantity.js and materialSplit.js
 * exist. Naming only the fields that are actually blank — rather than reciting
 * the form's whole required list — is the other reason it is worth a function.
 */

/**
 * Whether a form value counts as "not filled in".
 *
 * Deliberately covers only the three shapes the admin forms hand it — text
 * inputs and `<select>` values (strings), multi-select state (arrays), and the
 * nullish case. There is no numeric branch on purpose: no caller passes a
 * number, and guessing whether 0 means "blank" or "zero" with nothing to
 * validate the guess against is how a helper grows behaviour nobody can defend.
 *
 * @param {string|Array|null|undefined} value - The form value to test.
 * @returns {boolean} True when the field should be reported as missing.
 */
function isBlank(value) {
    if (value == null) return true
    if (Array.isArray(value)) return value.length === 0
    return value.trim() === ''
}

/**
 * Joins field labels the way a person would read them aloud.
 *
 * @param {string[]} labels - One or more field labels, already filtered to the blank ones.
 * @returns {string} e.g. 'Name', 'Name and Unit', 'Name, Code and Unit'.
 */
function joinLabels(labels) {
    if (labels.length === 1) return labels[0]
    return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`
}

/**
 * Reports which required fields were left blank, as a ready-to-display sentence.
 *
 * @param {Array<[string, string|Array|null|undefined]>} fields - `[label, value]`
 * pairs in the order they appear in the form, so the message reads top to bottom.
 * @returns {string|null} The message, or null when nothing is missing — which is
 * the caller's signal to go ahead and submit.
 *
 * @example
 * missingFieldsMessage([['Name', 'PP granulat'], ['Unit', '']])   // 'Unit is required'
 * missingFieldsMessage([['Name', ''], ['Unit', '']])              // 'Name and Unit are required'
 * missingFieldsMessage([['Name', ''], ['Code', ''], ['Unit', '']]) // 'Name, Code and Unit are required'
 * missingFieldsMessage([['Name', 'x'], ['Unit', 'kg']])           // null
 */
export function missingFieldsMessage(fields) {
    const missing = fields.filter(([, value]) => isBlank(value)).map(([label]) => label)

    if (missing.length === 0) return null

    const verb = missing.length === 1 ? 'is' : 'are'
    return `${joinLabels(missing)} ${verb} required`
}
