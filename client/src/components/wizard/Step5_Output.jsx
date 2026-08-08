/**
 * @file Step5_Output.jsx
 * @description Wizard step 5: confirm what was produced, record the end time
 * and closing details — then submit the whole completion payload (including
 * steps 3–4 data held in wizard state) in one call. The produced quantity is
 * entered back on step 4, where the calculator needs it; this
 * step only shows it back for confirmation.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { completeRun } from '../../api/productionRuns'
import { rollToNextDayIfAtOrBefore } from '../../lib/dates'
import { formatQuantity } from '../../lib/quantity'
import { common } from '../../styles/common'
import { getErrorMessage } from '../../lib/errorMessage'
import TimeInput24 from '../TimeInput24'

/**
 * Renders the completion fields and submits the run completion.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.data - Accumulated wizard formData: parameterValues, materialUsages,
 * quantityProduced and the run-level weights (netWeightPerUnit/grossWeightPerUnit/scrapKg)
 * from steps 3–4 all ride along in the final payload. `productUnit` is display-only —
 * the server reads the unit off the run's own product, so it is never sent.
 * @param {string} props.runId - UUID of the run created after step 2 — the completion target.
 * @param {Function} props.onDraftChange - Reports endTime/energyEnd/notes up to
 * formData on every change, since this step has no "Next" click to flush on Back like steps 1-4.
 * @param {Function} props.onBeforeExit - Called right before navigating away after a successful
 * completion, so NewRunPage's abandon-run guard doesn't mistake this intentional exit for one.
 * @returns {JSX.Element}
 *
 * @example
 * <Step5_Output data={formData} runId={runId} onDraftChange={handleStep5DraftChange} onBeforeExit={markIntentionalExit} />
 */
export default function Step5_Output({ data, runId, onDraftChange, onBeforeExit }) {

const navigate = useNavigate()

const [endTime, setEndTime] = useState(data.endTime || '')
const [energyEnd, setEnergyEnd] = useState(data.energyEnd || '')
const [notes, setNotes] = useState(data.notes || '')

const [isSubmitting, setIsSubmitting] = useState(false)
const [error, setError] = useState(null)

// Reports the draft up to formData on every change — unlike steps 1-4, this
// step has no "Next" click to hook a flush into, so Back would otherwise
// discard it.
useEffect(() => {
    onDraftChange({ endTime, energyEnd, notes })
}, [endTime, energyEnd, notes, onDraftChange])

// ─── VALIDATION & SUBMIT ─────────────────────────────────────────────────────

/**
 * Checks completion requirements before submit: end time present, a positive
 * produced quantity carried over from step 4, and an end meter reading at or
 * above step 1's start reading. The quantity check is a backstop, not a form
 * rule — step 4 already refuses to advance without one, so failing here means
 * wizard state was lost, not that the operator left a field blank.
 *
 * @returns {boolean} true when the payload is safe to send; false after setting an error.
 *
 * @example
 * if (!validate()) return
 */
function validate() {
    if (!endTime) {
    setError('End time is required.')
    return false
    }

    if (!(Number(data.quantityProduced) > 0)) {
    setError('Quantity produced is missing — go back to step 4 and enter it.')
    return false
    }

    // The kWh counter only climbs, so an end reading below step 1's start
    // reading is a typo — almost always the two transposed. The server rejects
    // it as well; catching it here means the operator fixes one field instead
    // of losing a submitted form to a 400.
    if (energyEnd !== '' && data.energyStart !== '' && data.energyStart != null
        && Number(energyEnd) < Number(data.energyStart)) {
    setError(`End meter reading can't be below the start reading (${data.energyStart} kWh).`)
    return false
    }

    return true
}

/**
 * Builds the completion payload (merging steps 3–4 data from wizard state) and
 * submits it; navigates to the runs list on success.
 *
 * @returns {Promise<void>} Resolves after navigation or after the error state is set.
 *
 * @example
 * <button onClick={handleComplete}>Complete Run ✓</button>
 */
async function handleComplete() {
    if (!validate()) return

    setIsSubmitting(true)
    setError(null)

    try {
    const payload = {
        // rollToNextDayIfAtOrBefore converts the local wall-clock end time to
        // a real UTC timestamp, rolling the date to the next day for
        // overnight runs (end wall-clock at or before start wall-clock).
        endTime: rollToNextDayIfAtOrBefore(data.date, data.startTime, endTime),
        parameterValues: data.parameterValues,
        materialUsages: data.materialUsages,
        quantityProduced: Number(data.quantityProduced),
        // != null (not truthiness): a scrap of 0 is a real value that must be
        // sent — a perfect run's zero scrap should overwrite nothing silently.
        ...(data.netWeightPerUnit != null && { netWeightPerUnit: data.netWeightPerUnit }),
        ...(data.grossWeightPerUnit != null && { grossWeightPerUnit: data.grossWeightPerUnit }),
        ...(data.scrapKg != null && { scrapKg: data.scrapKg }),
        ...(energyEnd !== '' && { energyEnd: Number(energyEnd) }),
        ...(notes && { notes }),
    }

    await completeRun(runId, payload)
    onBeforeExit()
    navigate('/runs')

    } catch (err) {
    console.error(err)
    // Prefer the server's message: 409s carry actionable detail (which material
    // is short, or that someone else already completed this run).
    setError(getErrorMessage(err, 'Failed to complete run. Please try again.'))
    } finally {
    setIsSubmitting(false)
    }
}

// ─── RENDER ──────────────────────────────────────────────────────────────────

return (
    <div style={common.wizardContainer}>
    <h2 style={styles.heading}>Output & Completion</h2>
    <p style={common.subheading}>
        Confirm what was produced and close out the run.
    </p>

    {error && <div style={common.errorBox}>{error}</div>}

    {/* Read-only echo of step 4's figure: one run produces one quantity of the
        run's own product, so there is nothing to pick here — only to confirm. */}
    <div style={styles.outputCard}>
        <div style={styles.outputCardHeader}>
        <span style={styles.outputCardTitle}>Quantity Produced</span>
        <span style={styles.outputCardValue}>
            {formatQuantity(data.quantityProduced, data.productUnit)}
        </span>
        </div>
        <p style={styles.outputCardHint}>
        Entered on the previous step — press Back to change it.
        </p>
    </div>

    {/* End Time */}
    <div style={common.field}>
        <label style={common.label}>End Time *</label>
        <TimeInput24
        value={endTime}
        onChange={setEndTime}
        />
    </div>

    {/* Energy End */}
    <div style={common.field}>
        <label style={common.label}>Energy Meter End (kWh)</label>
        <input
        style={styles.input}
        type='number'
        value={energyEnd}
        onChange={e => setEnergyEnd(e.target.value)}
        onWheel={e => e.target.blur()}
        placeholder='e.g. 12500'
        />
    </div>

    {/* Notes */}
    <div style={common.field}>
        <label style={common.label}>Notes</label>
        <textarea
        style={styles.textarea}
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder='Any observations about this run...'
        rows={3}
        />
    </div>

    <button
        style={{
        ...styles.completeButton,
        opacity: isSubmitting ? 0.6 : 1
        }}
        onClick={handleComplete}
        disabled={isSubmitting}
    >
        {isSubmitting ? 'Completing Run...' : 'Complete Run ✓'}
    </button>

    </div>
)
}

const styles = {
heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '0.5rem',
},
input: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    width: '100%',
    boxSizing: 'border-box',
},
textarea: {
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--color-border)',
    backgroundColor: 'var(--color-surface)',
    color: 'var(--color-text-primary)',
    fontSize: '0.95rem',
    resize: 'vertical',
    fontFamily: 'inherit',
},
outputCard: {
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '1rem',
    marginBottom: '1rem',
},
outputCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
},
outputCardTitle: {
    color: 'var(--color-text-primary)',
    fontSize: '0.9rem',
    fontWeight: 'bold',
},
outputCardValue: {
    color: 'var(--color-text-primary)',
    fontSize: '1.1rem',
    fontWeight: 'bold',
},
outputCardHint: {
    color: 'var(--color-text-muted)',
    fontSize: '0.8rem',
    marginTop: '0.4rem',
},
completeButton: {
    marginTop: '0.5rem',
    padding: '0.75rem',
    backgroundColor: 'var(--color-success)',
    color: 'var(--color-on-accent)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    cursor: 'pointer',
    width: '100%',
},
}
