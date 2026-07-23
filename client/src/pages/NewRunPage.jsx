/**
 * @file NewRunPage.jsx
 * @description Orchestrates the 5-step new-run wizard: owns the accumulated
 * formData, decides when the run is actually created (after step 2), and
 * fetches last-run values to prefill step 3. Step UIs do NOT belong here —
 * each lives in components/wizard/.
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import Step1_BasicInfo from '../components/wizard/Step1_BasicInfo'
import Step2_Recipe from '../components/wizard/Step2_Recipe'
import Step3_Parameters from '../components/wizard/Step3_Parameters'
import Step4_Materials from '../components/wizard/Step4_Materials'
import Step5_Output from '../components/wizard/Step5_Output'
import { createRun, getAllRuns, getRunById, deleteRun } from '../api/productionRuns'
import { rollToNextDayIfAtOrBefore } from '../lib/dates'
import { common } from '../styles/common'

/**
 * Glues a date input and a time input into the timestamp string the API stores.
 * Deliberately has NO timezone suffix: the DB columns are naive timestamps, so
 * "what the wall clock said" is preserved as typed.
 *
 * @param {string} dateStr - Date input value, "YYYY-MM-DD".
 * @param {string} timeStr - Time input value, "HH:mm".
 * @returns {string} Local ISO-like timestamp, e.g. "2026-07-04T08:30:00.000".
 *
 * @example
 * toLocalISO('2026-07-04', '08:30') // → "2026-07-04T08:30:00.000"
 */
// TODO: this whole approach breaks the moment server and client disagree on
// timezone — the fix_timestamp_timezone migration is proof it already bit once.
// Standardize on UTC end-to-end. todo.md Group 6 #3.
function toLocalISO(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00.000`
}

/**
 * Renders the wizard shell: progress bar, current step, and Back control.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/runs/new" element={<NewRunPage />} />
 */
function NewRunPage() {

  const navigate = useNavigate()

  const [currentStep, setCurrentStep] = useState(1)
  const [runId, setRunId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [error, setError] = useState(null)

  // Single accumulator for all five steps so any step can be revisited without
  // losing what the others collected; each step edits only its own slice.
  const [formData, setFormData] = useState({
    operatorId: '',
    machineId: '',
    productId: '',
    date: '',
    startTime: '',
    warmupStartTime: '',
    stableStartTime: '',
    energyStart: '',
    potentialBuyer: '',
    recipeId: '',
    parameterValues: [],
    materialUsages: [],
    // Step 4's calculator slice: null (not '') marks "never entered", which
    // both the last-run prefill and step 5's payload spreads rely on.
    quantityProduced: null,
    netWeightPerUnit: null,
    grossWeightPerUnit: null,
    scrapKg: null,
    outputs: [],
    endTime: '',
    energyEnd: '',
    notes: ''
  })

  // ─── STEP FLOW ──────────────────────────────────────────────────────────────

  /**
   * Merges a finished step's data into formData and advances the wizard;
   * after step 2 it triggers the actual run creation instead.
   *
   * @param {Object} stepData - Whatever the step collected (its slice of formData).
   * @returns {Promise<void>} Resolves once the step change (or run creation) is done.
   *
   * @example
   * <Step1_BasicInfo data={formData} onNext={handleStepNext} />
   */
  async function handleStepNext(stepData) {
    // Belt-and-suspenders: the Step 2 button disables itself on isSubmitting,
    // but this closes the gap if a second click's handler already fired
    // before that re-render lands.
    if (isSubmitting) return

    // Local merge used immediately because setFormData is asynchronous — reading
    // formData right after setting it would hand stale data to handleCreateRun.
    const updatedData = { ...formData, ...stepData }
    setFormData(updatedData)

    // Step 2 is the commit point: header info is complete, so the run is
    // created NOW (as in_progress) — steps 3–5 only fill wizard state until
    // the final completion call.
    if (currentStep === 2) {
      await handleCreateRun(updatedData)
      return
    }

    setCurrentStep(prev => prev + 1)
  }

  /**
   * Merges step 5's in-progress draft into formData without advancing the
   * wizard — step 5 has no "Next" click to hook a flush into (it's the last
   * step; its only action is "Complete Run"), so it reports every change as
   * it happens instead, keeping formData current for if the operator hits Back.
   *
   * @param {Object} stepData - Step 5's current endTime/energyEnd/notes/outputs.
   * @returns {void}
   *
   * @example
   * <Step5_Output data={formData} onDraftChange={handleStep5DraftChange} />
   */
  function handleStep5DraftChange(stepData) {
    setFormData(prev => ({ ...prev, ...stepData }))
  }

  // Warns before an accidental tab-close/navigation once a run row exists
  // server-side (steps 3-5) — the wizard has no way to resume a run, so an
  // unconfirmed exit here otherwise leaves it stuck in_progress forever.
  // Browsers ignore any custom message and show their own generic prompt.
  useEffect(() => {
    if (currentStep <= 2) return

    function handleBeforeUnload(e) {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [currentStep])

  /**
   * Deletes the in-progress run and returns to the run list — the
   * intentional way to bail out of steps 3-5 instead of closing the tab.
   *
   * @returns {Promise<void>} Resolves after navigation or after the error state is set.
   *
   * @example
   * <button onClick={handleCancelRun}>Cancel Run</button>
   */
  async function handleCancelRun() {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this run? The run and any progress will be permanently deleted.'
    )
    if (!confirmed) return

    setIsCancelling(true)
    try {
      await deleteRun(runId)
      navigate('/runs')
    } catch (err) {
      console.error(err)
      setError('Failed to cancel production run')
      setIsCancelling(false)
    }
  }

  /**
   * Creates the run from steps 1–2 data, then tries to prefill steps 3–5 from
   * the last completed run on the same machine + product: parameter values,
   * actual material usages (copied verbatim, not recomputed), total produced
   * quantity, and the run-level weights — settings and yields rarely change
   * between runs of the same product.
   *
   * @param {Object} data - The merged formData (passed explicitly to avoid stale state).
   * @returns {Promise<void>} Resolves after the step advances or the error state is set.
   *
   * @example
   * await handleCreateRun({ ...formData, recipeId: 'd1e2…' })
   */
  async function handleCreateRun(data) {
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        // date goes through toISOString (UTC) while the times below stay naive —
        // two conventions in one payload. TODO: unify, see todo.md Group 6 #3.
        date: new Date(data.date).toISOString(),
        startTime: toLocalISO(data.date, data.startTime),
        operatorId: data.operatorId,
        machineId: data.machineId,
        productId: data.productId,
        recipeId: data.recipeId,
        ...(data.warmupStartTime && {
          // No rollover: warmup legitimately precedes startTime on the same
          // calendar day (todo.md Group 6 #7), unlike stableStartTime below.
          warmupStartTime: toLocalISO(data.date, data.warmupStartTime)
        }),
        ...(data.stableStartTime && {
          // Rolls forward a day when stable's wall-clock is at/before start's —
          // same rule already applied to endTime (see rollToNextDayIfAtOrBefore).
          stableStartTime: rollToNextDayIfAtOrBefore(data.date, data.startTime, data.stableStartTime)
        }),
        ...(data.energyStart !== undefined && { energyStart: Number(data.energyStart) }),
        ...(data.potentialBuyer && { potentialBuyer: data.potentialBuyer }),
        ...(data.notes && { notes: data.notes }),
      }

      const response = await createRun(payload)
      setRunId(response.data.id)

      // Prefill fetch is inside its own try/catch: it's a convenience, and a
      // failure here must not block the operator from continuing the wizard.
      try {
        const lastRunRes = await getAllRuns({
        machineId: data.machineId,
        productId: data.productId,
        status: 'completed',
        limit: 1
        })

        const lastRunSummary = lastRunRes.data[0]

        if (lastRunSummary) {
          // Second request because the list endpoint doesn't include the
          // children (parameters, usages, outputs) — only the detail does.
          const lastRunDetail = await getRunById(lastRunSummary.id)
          const lastRun = lastRunDetail.data

          const prefill = {}

          if (lastRun.runParameterValues && lastRun.runParameterValues.length > 0) {
            prefill.parameterValues = lastRun.runParameterValues.map(pv => ({
                machineParameterId: pv.machineParameterId,
                value: pv.value
            }))
          }

          // Copied verbatim (not recomputed from the calculator) so any manual
          // corrections the operator made last time carry over.
          if (lastRun.materialUsages && lastRun.materialUsages.length > 0) {
            prefill.materialUsages = lastRun.materialUsages.map(mu => ({
                materialId: mu.materialId,
                quantityUsed: mu.quantityUsed
            }))
          }

          // SUM across all outputs: the calculator's quantity is the run total
          // even when several products came off the machine.
          if (lastRun.runOutputs && lastRun.runOutputs.length > 0) {
            prefill.quantityProduced = lastRun.runOutputs.reduce(
                (sum, o) => sum + o.quantityProduced, 0
            )
          }

          // != null guards: pre-migration runs have no neto (and possibly no
          // bruto/scrap) — leave those fields blank instead of seeding "null".
          if (lastRun.netWeightPerUnit != null) prefill.netWeightPerUnit = lastRun.netWeightPerUnit
          if (lastRun.grossWeightPerUnit != null) prefill.grossWeightPerUnit = lastRun.grossWeightPerUnit
          if (lastRun.scrapKg != null) prefill.scrapKg = lastRun.scrapKg

          setFormData(prev => ({ ...prev, ...prefill }))
        }
      } catch (err) {
        console.error('Could not fetch last run for pre-fill:', err)
    }

    setCurrentStep(3)

    } catch (err) {
      console.error(err)
      setError('Failed to create production run. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Steps back within the post-creation phase (steps 3–5 only). Steps 1–2 are
   * unreachable on purpose: the run already exists in the database, and editing
   * its header from here would desynchronize wizard state from the stored row.
   *
   * @returns {void}
   *
   * @example
   * <button onClick={handleBack}>Back</button>
   */
  function handleBack() {
    if (currentStep === 1) return
    if (currentStep <= 2) return

    setCurrentStep(prev => prev - 1)
  }

  /**
   * Picks the step component for the current wizard position.
   *
   * @returns {JSX.Element} The active step, wired to formData and handleStepNext.
   *
   * @example
   * {renderStep()}
   */
  function renderStep() {
    switch (currentStep) {
      case 1:
        return (
          <Step1_BasicInfo
            data={formData}
            onNext={handleStepNext}
          />
        )
      case 2:
        return (
          <Step2_Recipe
            data={formData}
            onNext={handleStepNext}
            isSubmitting={isSubmitting}
          />
        )
      case 3:
        return (
          <Step3_Parameters
            data={formData}
            runId={runId}
            onNext={handleStepNext}
          />
        )
      case 4:
        return (
          <Step4_Materials
            data={formData}
            runId={runId}
            onNext={handleStepNext}
          />
        )
      case 5:
        return (
          <Step5_Output
            data={formData}
            runId={runId}
            onNext={handleStepNext}
            onDraftChange={handleStep5DraftChange}
          />
        )
      default:
        return <p>Unknown step</p>
    }
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div style={styles.container}>

      <div style={styles.progressSection}>
        <p style={styles.stepLabel}>Step {currentStep} of 5</p>
        <div style={styles.progressBar}>
          {[1, 2, 3, 4, 5].map(step => (
            <div
              key={step}
              style={{
                ...styles.progressSegment,
                backgroundColor: step <= currentStep ? 'var(--color-accent)' : 'var(--color-progress-empty)'
              }}
            />
          ))}
        </div>
      </div>

      {error && (
        <div style={common.errorBox}>
          {error}
        </div>
      )}

      {isSubmitting && (
        <p style={styles.loadingText}>Creating run, please wait...</p>
      )}

      {renderStep()}

      {currentStep > 2 && (
        <div style={styles.stepActions}>
          <button onClick={handleBack} style={styles.backButton}>
            Back
          </button>
          <button
            onClick={handleCancelRun}
            style={styles.cancelButton}
            disabled={isSubmitting || isCancelling || !runId}
          >
            Cancel Run
          </button>
        </div>
      )}

    </div>
  )
}

const styles = {
  container: {
    padding: '1rem',
    maxWidth: '600px',
    margin: '0 auto',
  },
  progressSection: {
    marginBottom: '1.5rem',
  },
  stepLabel: {
    color: 'var(--color-text-secondary)',
    fontSize: '0.9rem',
    marginBottom: '0.5rem',
  },
  progressBar: {
    display: 'flex',
    gap: '0.5rem',
  },
  progressSegment: {
    height: '6px',
    flex: 1,
    borderRadius: '3px',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    marginBottom: '1rem',
  },
  stepActions: {
    marginTop: '1rem',
    display: 'flex',
    gap: '0.75rem',
  },
  backButton: {
    padding: '0.5rem 1.25rem',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
  },
  cancelButton: {
    backgroundColor: 'transparent',
    border: '1px solid var(--color-danger)',
    color: 'var(--color-danger)',
    padding: '0.5rem 1.25rem',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.85rem',
  },
}

export default NewRunPage
