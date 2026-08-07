/**
 * @file dates.js
 * @description Shared date/time helpers. Wall-clock input (date + "HH:mm")
 * is converted to a real UTC ISO string as soon as it leaves the browser —
 * see localToUTCISOString — so every timestamp the server stores and returns
 * is unambiguous UTC; the formatters below convert it back to local time for
 * display, and only for display.
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
 * Converts a local wall-clock date + time into a real UTC ISO string. The
 * naive "date + time" string is parsed by the JS engine as local time in
 * whatever timezone is running the code — in the browser, that's the
 * operator's own timezone, exactly what they meant when they typed it into
 * `<input type="date">`/TimeInput24 — and toISOString() then converts that
 * instant to UTC. This is the single place local input becomes the
 * timezone-qualified string the server requires. Must only be called
 * client-side: the same naive string parsed in Node would be interpreted in
 * the server process's timezone instead, which is exactly the bug this
 * closes.
 *
 * @param {string} dateStr - Date input value, "YYYY-MM-DD".
 * @param {string} timeStr - Time input value, "HH:mm".
 * @returns {string} UTC ISO timestamp, e.g. "2026-07-04T07:30:00.000Z" for
 * 08:30 local time in a UTC+1 timezone.
 *
 * @example
 * localToUTCISOString('2026-07-04', '08:30') // → "2026-07-04T07:30:00.000Z" (UTC+1)
 */
export function localToUTCISOString(dateStr, timeStr) {
  return new Date(`${dateStr}T${timeStr}:00`).toISOString()
}

/**
 * Shared core of the two rollover helpers below. Builds a UTC timestamp from
 * the run date and a target wall-clock time, rolling the date forward one day
 * when the target's clock reads earlier than the anchor's — i.e. it wrapped
 * past midnight. `rollOnEqual` decides what an EQUAL pair means, which is the
 * only thing the two callers disagree about; see their JSDoc for why.
 *
 * Both time inputs are zero-padded "HH:mm" strings, so plain string
 * comparison orders them correctly ("02:00" < "22:00") — no Date parsing
 * needed for the overnight test. The rolled date is re-formatted from LOCAL
 * date parts (getLocalDateString), not toISOString(), so the rollover itself
 * can't be shifted by a day before localToUTCISOString ever runs.
 *
 * @param {string} dateStr - Run date, "YYYY-MM-DD".
 * @param {string} anchorHHmm - Reference wall-clock time, "HH:mm".
 * @param {string} targetHHmm - Wall-clock time to place relative to the anchor, "HH:mm".
 * @param {boolean} rollOnEqual - Whether an equal pair counts as having wrapped.
 * @returns {string} UTC ISO timestamp — see localToUTCISOString.
 */
function rollToNextDay(dateStr, anchorHHmm, targetHHmm, rollOnEqual) {
  const wrapped = rollOnEqual ? targetHHmm <= anchorHHmm : targetHHmm < anchorHHmm
  let targetDate = dateStr
  if (wrapped) {
    const d = new Date(`${dateStr}T00:00:00`)
    d.setDate(d.getDate() + 1)
    targetDate = getLocalDateString(d)
  }
  return localToUTCISOString(targetDate, targetHHmm)
}

/**
 * Places a time that measures the END of a span: endTime vs. startTime.
 *
 * A run that starts at 22:00 and ends at 02:00 crossed midnight, so its end
 * belongs to the NEXT calendar day. The only signal we have is the wall clock
 * itself: a target time before the anchor can only mean the clock wrapped
 * around. Equal times roll too, because for a span they read as "came all the
 * way around" — a 24-hour run, not a zero-length one (the server rejects
 * endTime <= startTime outright, so a zero-length run isn't expressible
 * anyway). Spans longer than 24h can't be expressed with a time-only input;
 * that would need an end-date field.
 *
 * Contrast rollToNextDayIfBefore, which is for a point INSIDE the span and
 * therefore must not roll on equality.
 *
 * @param {string} dateStr - Run date, "YYYY-MM-DD".
 * @param {string} anchorHHmm - Reference wall-clock time, "HH:mm" (e.g. startTime).
 * @param {string} targetHHmm - Wall-clock time to place relative to the anchor, "HH:mm".
 * @returns {string} UTC ISO timestamp — see localToUTCISOString.
 *
 * @example
 * rollToNextDayIfAtOrBefore('2026-07-07', '22:00', '02:00') // → UTC instant for 2026-07-08T02:00 local
 * rollToNextDayIfAtOrBefore('2026-07-07', '08:00', '14:30') // → UTC instant for 2026-07-07T14:30 local
 * rollToNextDayIfAtOrBefore('2026-07-07', '08:00', '08:00') // → UTC instant for 2026-07-08T08:00 local
 */
export function rollToNextDayIfAtOrBefore(dateStr, anchorHHmm, targetHHmm) {
  return rollToNextDay(dateStr, anchorHHmm, targetHHmm, true)
}

/**
 * Places a time that marks a POINT INSIDE the run: stableStartTime vs.
 * startTime.
 *
 * Strict comparison, unlike rollToNextDayIfAtOrBefore. Stable start is the
 * moment the line reached steady output, not the length of anything, so an
 * equal pair means it stabilised the instant production began — same calendar
 * day. Rolling it would store a measurement 24 hours late, which is not a real
 * scenario on a shift-length run, and the server explicitly allows
 * stableStartTime === startTime (productionRuns.js POST / and PUT /:id), so
 * nothing downstream would catch it.
 *
 * A strictly earlier clock still rolls: a run starting 23:30 and stabilising
 * at 00:15 genuinely crossed midnight.
 *
 * @param {string} dateStr - Run date, "YYYY-MM-DD".
 * @param {string} anchorHHmm - Reference wall-clock time, "HH:mm" (e.g. startTime).
 * @param {string} targetHHmm - Wall-clock time to place relative to the anchor, "HH:mm".
 * @returns {string} UTC ISO timestamp — see localToUTCISOString.
 *
 * @example
 * rollToNextDayIfBefore('2026-07-07', '08:00', '08:00') // → UTC instant for 2026-07-07T08:00 local
 * rollToNextDayIfBefore('2026-07-07', '23:30', '00:15') // → UTC instant for 2026-07-08T00:15 local
 */
export function rollToNextDayIfBefore(dateStr, anchorHHmm, targetHHmm) {
  return rollToNextDay(dateStr, anchorHHmm, targetHHmm, false)
}

/**
 * Formats a timestamp as a short en-GB date for cards/lists.
 *
 * @param {string} dateStr - ISO date string; caller handles null/empty.
 * @returns {string} e.g. "04 Jul 2026".
 *
 * @example
 * formatDisplayDate('2026-07-04T00:00:00.000Z') // → "04 Jul 2026"
 */
export function formatDisplayDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  })
}

/**
 * Formats a date as a full en-GB heading, e.g. for the Dashboard's date line.
 *
 * @param {Date} [date=new Date()] - Defaults to the current moment.
 * @returns {string} e.g. "Tuesday, 21 July 2026".
 *
 * @example
 * formatLongDate(new Date('2026-07-21')) // → "Tuesday, 21 July 2026"
 */
export function formatLongDate(date = new Date()) {
  return date.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

/**
 * Formats a timestamp as a numeric en-GB date for XLSX export cells.
 *
 * @param {string} dateStr - ISO date string; caller handles null/empty.
 * @returns {string} e.g. "04/07/2026".
 *
 * @example
 * formatExportDate('2026-07-04T00:00:00.000Z') // → "04/07/2026"
 */
export function formatExportDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB')
}

/**
 * Formats a date for use inside an export file name. Dots instead of slashes
 * because "/" is a path separator and invalid in file names.
 *
 * @param {string|Date} dateStr - Date to format.
 * @returns {string} e.g. "04.07.2026".
 *
 * @example
 * formatFileDate('2026-07-04') // → "04.07.2026"
 */
export function formatFileDate(dateStr) {
  return formatExportDate(dateStr).replace(/\//g, '.')
}

/**
 * Formats a timestamp as a 24-hour en-GB clock time — the single time
 * convention used everywhere in the app (screen and XLSX export alike), so a
 * run's start time reads the same on the Dashboard, the run detail page, and
 * in an exported report.
 *
 * @param {string} dateStr - ISO timestamp; caller handles null/empty.
 * @returns {string} e.g. "14:00".
 *
 * @example
 * formatDisplayTime('2026-07-04T14:00:00.000') // → "14:00"
 */
export function formatDisplayTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit'
  })
}
