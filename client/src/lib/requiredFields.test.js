/**
 * @file requiredFields.test.js
 * @description Guards `missingFieldsMessage` — the sentence that replaced ten bare
 * `return`s in the admin create and link forms.
 *
 * The ten call sites are all inside click handlers in JSX components, and this suite
 * runs with `environment: 'node'` and no jsdom (client/vitest.config.js), so none of
 * them can be asserted on directly. What is guardable is the decision they all share:
 * which fields count as blank, and how the resulting sentence reads. Both matter — a
 * message that recites every required field when only one is empty sends the user
 * back to fields they already filled, which is the failure this change exists to fix.
 */
import { describe, it, expect } from 'vitest'
import { missingFieldsMessage } from './requiredFields'

describe('missingFieldsMessage', () => {
  // The submit-is-allowed signal. Every caller branches on this being null, so a
  // helper that returned a string here would block every valid form in admin.
  it('returns null when every field is filled', () => {
    expect(missingFieldsMessage([['Name', 'PP granulat'], ['Unit', 'kg']])).toBeNull()
  })

  // Singular gets "is", and names only the one blank field — MaterialsPage's most
  // common failure is a filled name with the unit dropdown still on "Unit...".
  it('names a single blank field on its own, with a singular verb', () => {
    expect(missingFieldsMessage([['Name', 'PP granulat'], ['Unit', '']]))
      .toBe('Unit is required')
  })

  // Two blanks are joined with "and" and nothing else — no serial comma to hold.
  it('joins two blank fields with "and"', () => {
    expect(missingFieldsMessage([['Name', ''], ['Unit', '']]))
      .toBe('Name and Unit are required')
  })

  // ProductsPage's fully-empty form. The last label is special-cased; a naive
  // join(', ') would produce "Name, Code, Unit are required".
  it('joins three blank fields as "A, B and C"', () => {
    expect(missingFieldsMessage([['Name', ''], ['Code', ''], ['Unit', '']]))
      .toBe('Name, Code and Unit are required')
  })

  // A space is not a name. Without the trim this passes the guard, reaches the API
  // and creates a record whose name renders as an empty row in the list.
  it('treats a whitespace-only string as blank', () => {
    expect(missingFieldsMessage([['Name', '   ']])).toBe('Name is required')
  })

  // RecipesPage passes selectedProductIds and items, which are arrays, not strings.
  // Without the array branch these hit `.trim()` and throw a TypeError inside the
  // click handler — silence replaced by a crash.
  it('treats an empty array as blank', () => {
    expect(missingFieldsMessage([['Products', []]])).toBe('Products is required')
  })

  it('treats a non-empty array as filled', () => {
    expect(missingFieldsMessage([['Products', ['a9d2']]])).toBeNull()
  })

  // Route params and API state arrive undefined on first render; a null-safe check
  // has to come before the trim for the same TypeError reason as the array case.
  it('treats null and undefined as blank', () => {
    expect(missingFieldsMessage([['Product', null]])).toBe('Product is required')
    expect(missingFieldsMessage([['Product', undefined]])).toBe('Product is required')
  })
})
