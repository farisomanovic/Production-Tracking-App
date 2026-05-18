/**
 * Renders the multi-step production-run creation wizard.
 * Creates the run after recipe selection and then records operational details.
 * Pre-fills parameter values from the last completed matching run when available.
 */
import { useState } from 'react'
import Step1_BasicInfo from '../components/wizard/Step1_BasicInfo'
import Step2_Recipe from '../components/wizard/Step2_Recipe'
import Step3_Parameters from '../components/wizard/Step3_Parameters'
import Step4_Materials from '../components/wizard/Step4_Materials'
import Step5_Output from '../components/wizard/Step5_Output'
import { createRun, getAllRuns, getRunById  } from '../api/productionRuns'

/**
 * Converts separate local date and time inputs into the timestamp shape expected by the API.
 *
 * @param {string} dateStr - Date input value in YYYY-MM-DD format.
 * @param {string} timeStr - Time input value in HH:mm format.
 * @returns {string} Local ISO-like timestamp without timezone conversion.
 */
function toLocalISO(dateStr, timeStr) {
  return `${dateStr}T${timeStr}:00.000`
}

function NewRunPage() {

  const [currentStep, setCurrentStep] = useState(1)
  const [runId, setRunId] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState(null)

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
    outputs: [],
    endTime: '',
    energyEnd: '',
    notes: ''
  })

  // This function is called by every step when the user clicks Next.
  // stepData is an object with whatever that step collected.
  // We merge it into formData and then decide what to do next.
  async function handleStepNext(stepData) {
    // Merge this step's data into the overall formData
    const updatedData = { ...formData, ...stepData }
    setFormData(updatedData)

    // Step 2 is special — after it we create the run in the database
    if (currentStep === 2) {
      await handleCreateRun(updatedData)
      return // handleCreateRun will advance the step itself
    }

    // For all other steps just move forward
    setCurrentStep(prev => prev + 1)
  }

  // Called only after Step 2 completes
  async function handleCreateRun(data) {
    setIsSubmitting(true)
    setError(null)

    try {
      const payload = {
        date: new Date(data.date).toISOString(),
        startTime: toLocalISO(data.date, data.startTime),
        operatorId: data.operatorId,
        machineId: data.machineId,
        productId: data.productId,
        recipeId: data.recipeId,
        // Optional fields — only include if they have a value
        ...(data.warmupStartTime && { 
          warmupStartTime: toLocalISO(data.date, data.warmupStartTime)
        }),
        ...(data.stableStartTime && { 
          stableStartTime: toLocalISO(data.date, data.stableStartTime)
        }),
        ...(data.energyStart && { energyStart: Number(data.energyStart) }),
        ...(data.potentialBuyer && { potentialBuyer: data.potentialBuyer }),
        ...(data.notes && { notes: data.notes }),
      }
      
      const response = await createRun(payload)
      setRunId(response.data.id)

      // Fetch the last completed run for this machine + product
      // We use limit 1 and order by date desc so we get the most recent one
      // We also filter by status=completed so in-progress runs are ignored
      try {
        const lastRunRes = await getAllRuns({
        machineId: data.machineId,
        productId: data.productId,
        status: 'completed',
        limit: 1
        })

        const lastRunSummary = lastRunRes.data[0]

        if (lastRunSummary) {
          // Fetch the full run detail which includes runParameterValues
          const lastRunDetail = await getRunById(lastRunSummary.id)
          const lastRun = lastRunDetail.data

          if (lastRun.runParameterValues && lastRun.runParameterValues.length > 0) {
            const prefilled = lastRun.runParameterValues.map(pv => ({
                machineParameterId: pv.machineParameterId,
                value: pv.value
            }))
            setFormData(prev => ({ ...prev, parameterValues: prefilled }))
          }
        }
      } catch (err) {
        // If the fetch fails for any reason, just continue normally
        // Pre-filling is a convenience, not a requirement
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

  function handleBack() {
    // Don't allow going back past step 1
    if (currentStep === 1) return

    // Important: once the run is created (after step 2), 
    // going back to step 1 or 2 is dangerous because the run 
    // already exists in the database. For now we only allow 
    // going back within steps 3-5.
    if (currentStep <= 2) return

    setCurrentStep(prev => prev - 1)
  }

  // Renders the correct step component based on currentStep
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
          />
        )
      default:
        return <p>Unknown step</p>
    }
  }

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
        <div style={styles.errorBox}>
          {error}
        </div>
      )}

      {isSubmitting && (
        <p style={styles.loadingText}>Creating run, please wait...</p>
      )}

      {renderStep()}

      {currentStep > 2 && (
        <button onClick={handleBack} style={styles.backButton}>
          Back
        </button>
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
  errorBox: {
    backgroundColor: 'var(--color-danger-soft)',
    color: 'var(--color-danger)',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
  },
  loadingText: {
    color: 'var(--color-text-secondary)',
    marginBottom: '1rem',
  },
  backButton: {
    marginTop: '1rem',
    padding: '0.5rem 1.25rem',
    backgroundColor: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    cursor: 'pointer',
    color: 'var(--color-text-primary)',
  },
}

export default NewRunPage

