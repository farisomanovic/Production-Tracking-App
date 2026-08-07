/**
 * @file dates.test.js
 * @description Unit tests for the wall-clock → UTC conversion helpers. These
 * three functions are the only place local operator input becomes the
 * timezone-qualified string the server stores, so a wrong answer here is
 * silently wrong data — no 400, no error banner, nothing on screen.
 *
 * Every assertion compares against a locally-parsed Date rather than a
 * hardcoded UTC string. `new Date('2026-08-05T08:00:00')` (no Z) is parsed in
 * whatever timezone is running the test, which is exactly what the helpers do
 * — so the comparison holds in Sarajevo, in CI, and in UTC alike. Asserting
 * '2026-08-05T06:00:00.000Z' instead would hardcode UTC+2 and turn a green
 * suite into a machine-dependent one.
 */
import { describe, it, expect } from 'vitest'
import {
  localToUTCISOString,
  rollToNextDayIfAtOrBefore,
  rollToNextDayIfBefore
} from './dates'

/** The instant a "YYYY-MM-DD" + "HH:mm" pair means in the local timezone. */
function localInstant(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`).getTime()
}

describe('localToUTCISOString', () => {
  it('converts local wall-clock input to the matching UTC instant', () => {
    const iso = localToUTCISOString('2026-08-05', '08:00')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-05', '08:00'))
  })

  it('returns a Z-suffixed ISO string, not a naive local one', () => {
    expect(localToUTCISOString('2026-08-05', '08:00')).toMatch(/Z$/)
  })
})

describe('rollToNextDayIfAtOrBefore (endTime)', () => {
  it('rolls to the next day when the target clock is earlier — an overnight run', () => {
    const iso = rollToNextDayIfAtOrBefore('2026-08-05', '22:00', '02:00')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-06', '02:00'))
  })

  it('stays on the same day when the target clock is later', () => {
    const iso = rollToNextDayIfAtOrBefore('2026-08-05', '08:00', '14:30')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-05', '14:30'))
  })

  // Pins the asymmetry with rollToNextDayIfBefore: for a SPAN, equal clocks
  // mean the run came all the way around (24h). Unifying the two helpers
  // would have to break this test first.
  it('rolls on an equal clock — a 24-hour run, not a zero-length one', () => {
    const iso = rollToNextDayIfAtOrBefore('2026-08-05', '08:00', '08:00')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-06', '08:00'))
  })
})

describe('rollToNextDayIfBefore (stableStartTime)', () => {
  // Regression test: this exact case used to store
  // the stable measurement a full 24 hours late, with nothing rejecting it.
  it('stays on the same day when stable equals start', () => {
    const iso = rollToNextDayIfBefore('2026-08-05', '08:00', '08:00')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-05', '08:00'))
  })

  it('rolls to the next day when stable is strictly earlier — a real midnight crossing', () => {
    const iso = rollToNextDayIfBefore('2026-08-05', '23:30', '00:15')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-06', '00:15'))
  })

  it('stays on the same day when stable is later than start', () => {
    const iso = rollToNextDayIfBefore('2026-08-05', '08:00', '14:30')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-08-05', '14:30'))
  })
})

// The rollover is Date.setDate(getDate() + 1), which handles month and year
// ends itself — these assert we never hand-roll string arithmetic instead.
describe('rollover across calendar boundaries', () => {
  it('crosses a month end', () => {
    const iso = rollToNextDayIfBefore('2026-08-31', '23:30', '00:15')
    expect(new Date(iso).getTime()).toBe(localInstant('2026-09-01', '00:15'))
  })

  it('crosses a year end', () => {
    const iso = rollToNextDayIfAtOrBefore('2026-12-31', '22:00', '02:00')
    expect(new Date(iso).getTime()).toBe(localInstant('2027-01-01', '02:00'))
  })
})
