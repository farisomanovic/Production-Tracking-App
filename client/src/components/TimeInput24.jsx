/**
 * @file TimeInput24.jsx
 * @description Wraps react-time-picker to force 24-hour display everywhere.
 * Native `<input type="time">` delegates its displayed format (12h AM/PM vs
 * 24h) entirely to the browser/OS locale — there is no HTML attribute or CSS
 * that overrides this — so an operator on a 12-hour-locale device saw AM/PM
 * even though the rest of the app is 24-hour. react-time-picker renders its
 * own segmented input instead of the native control, so `format` decides the
 * display, not the browser. Styling lives in index.css (`.time-input-24`) —
 * this component's DOM (react-time-picker__wrapper/__inputGroup/...) can't be
 * reached with a plain `style` prop the way a native `<input>` can.
 */
import TimePicker from 'react-time-picker'
import 'react-time-picker/dist/TimePicker.css'

/**
 * Drop-in replacement for `<input type="time" value={value} onChange={...} />`
 * — same value contract ("HH:mm", or '' when unset) so no caller-side state,
 * validation, or payload logic needs to change.
 *
 * @param {string} value - "HH:mm", or '' when unset.
 * @param {(next: string) => void} onChange - Receives the new "HH:mm", or '' when cleared.
 *
 * @example
 * <TimeInput24 value={startTime} onChange={setStartTime} />
 */
export default function TimeInput24({ value, onChange }) {
  return (
    <TimePicker
      className='time-input-24'
      value={value || null}
      onChange={next => onChange(next || '')}
      format='HH:mm'
      disableClock
      maxDetail='minute'
      clearIcon='×'
    />
  )
}
