/**
 * @file dates.js
 * @description Shared date/time helpers for the naive "wall clock" timestamps
 * this app exchanges with the server (no timezone suffix — see todo.md
 * Group 6 #3 for the long-term standardization plan).
 */

/**
 * Formats a Date as a local "YYYY-MM-DD" string using its local calendar
 * parts — never `toISOString()`, which converts to UTC first and can shift
 * the date by one day for any local time between midnight and the local UTC
 * offset (e.g. Sarajevo, UTC+1/+2, between 00:00 and ~02:00). Used anywhere
 * the app needs "today" (or another Date) as a date-only string: the
 * dashboard's date filter, the run wizard's date-picker max, and
 * `rollToNextDayIfAtOrBefore` below.
 *
 * @param {Date} [date=new Date()] - Defaults to the current moment.
 * @returns {string} "YYYY-MM-DD" in local time, e.g. "2026-07-19".
 *
 * @example
 * getLocalDateString(new Date('2026-07-19T23:30:00')) // → "2026-07-19"
 */
export function getLocalDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Builds a timestamp from the run date and a target wall-clock time, rolling
 * the date forward one day when the target is at or before the anchor —
 * i.e. it wrapped past midnight relative to the anchor. Used for any
 * "this time happens after an earlier one, possibly on the next calendar
 * day" pair: endTime vs. startTime, and stableStartTime vs. startTime.
 *
 * A run that starts at 22:00 and ends at 02:00 crossed midnight, so its end
 * belongs to the NEXT calendar day. The only signal we have is the wall
 * clock itself: a target time at or before the anchor can only mean the
 * clock wrapped around. Equal times read as "came all the way around" — a
 * 24-hour span. Spans longer than 24h cannot be expressed with a time-only
 * input; that would need an end-date field.
 *
 * Both inputs are zero-padded "HH:mm" strings, so plain string comparison
 * orders them correctly ("02:00" < "22:00") — no Date parsing needed for
 * the overnight test. The rolled date is re-formatted from LOCAL date parts;
 * toISOString() would convert to UTC and could shift the day.
 *
 * @param {string} dateStr - Run date, "YYYY-MM-DD".
 * @param {string} anchorHHmm - Reference wall-clock time, "HH:mm" (e.g. startTime).
 * @param {string} targetHHmm - Wall-clock time to place relative to the anchor, "HH:mm".
 * @returns {string} Naive local timestamp, e.g. "2026-07-08T02:00:00.000" —
 * the same format toLocalISO produces for startTime.
 *
 * @example
 * rollToNextDayIfAtOrBefore('2026-07-07', '22:00', '02:00') // → "2026-07-08T02:00:00.000"
 * rollToNextDayIfAtOrBefore('2026-07-07', '08:00', '14:30') // → "2026-07-07T14:30:00.000"
 */
export function rollToNextDayIfAtOrBefore(dateStr, anchorHHmm, targetHHmm) {
  let targetDate = dateStr
  if (targetHHmm <= anchorHHmm) {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + 1)
    targetDate = getLocalDateString(d)
  }
  return `${targetDate}T${targetHHmm}:00.000`
}
