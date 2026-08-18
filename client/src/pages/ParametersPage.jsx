/**
 * @file ParametersPage.jsx
 * @description Admin page for parameter definitions (create, list, and
 * activate/deactivate — editing name/unit/description has no UI yet even though
 * the API supports it). Assigning parameters to machines happens on
 * MachineDetailPage, not here.
 */
import { useState } from 'react'
import { getAllParameters, createParameter, updateParameter } from '../api/parameters'
import { useApi } from '../hooks/useApi'
import ErrorBanner from '../components/ErrorBanner'
import { common } from '../styles/common'
import { getErrorMessage } from '../lib/errorMessage'
import { missingFieldsMessage } from '../lib/requiredFields'

/**
 * Renders the parameter list with an add form.
 *
 * @component
 * @returns {JSX.Element}
 *
 * @example
 * <Route path="/parameters" element={<ParametersPage />} />
 */
function ParametersPage() {
  const { data: parameters, loading, error, reload } = useApi(getAllParameters, 'Failed to load parameters')
  const [name, setName] = useState('')
  const [unit, setUnit] = useState('')
  const [description, setDescription] = useState('')
  const [actionError, setActionError] = useState(null)

  /**
   * Creates a parameter definition from the form, then refetches the list.
   *
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * <button onClick={handleSubmit}>Add Parameter</button>
   */
  async function handleSubmit() {
    setActionError(null)
    const missing = missingFieldsMessage([['Name', name]])
    if (missing) {
      setActionError(missing)
      return
    }
    try {
      await createParameter({
        name,
        ...(unit.trim() && { unit }),
        ...(description.trim() && { description })
      })
      setName('')
      setUnit('')
      setDescription('')
      reload()
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to create parameter'))
      console.error(err)
    }
  }

  /**
   * Soft-deletes a parameter (active: false) — stops it being offered for new
   * machine links while every recorded RunParameterValue keeps its foreign key.
   *
   * @param {string} id - Parameter UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleDeactivate('e01b…')
   */
  async function handleDeactivate(id) {
    try {
        await updateParameter(id, { active: false })
        reload()
    } catch (err) {
        // The server refuses with a 409 while a machine that collects this
        // parameter has a run in progress; getErrorMessage shows that reason.
        setActionError(getErrorMessage(err, 'Failed to deactivate parameter'))
        console.error(err)
    }
  }

  /**
   * Reactivates a soft-deleted parameter so machines can collect it again.
   *
   * @param {string} id - Parameter UUID.
   * @returns {Promise<void>} Resolves after reload or after the error state is set.
   *
   * @example
   * handleActivate('e01b…')
   */
  async function handleActivate(id) {
    try {
        await updateParameter(id, { active: true })
        reload()
    } catch (err) {
        setActionError(getErrorMessage(err, 'Failed to activate parameter'))
        console.error(err)
    }
  }

  if (loading) return <p style={common.loadingText}>Loading...</p>

  return (
    <div style={common.container}>
      <ErrorBanner message={error} onDismiss={reload} dismissLabel="Retry" />
      <ErrorBanner message={actionError} onDismiss={() => setActionError(null)} />

      <h1 style={styles.heading}>Parameters</h1>

      <div style={common.form}>
        <input
          style={common.input}
          type="text"
          placeholder="Parameter name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Unit (optional)"
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
        />
        <input
          style={common.input}
          type="text"
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button style={common.button} onClick={handleSubmit}>
          Add Parameter
        </button>
      </div>

      <div style={common.list}>
        {parameters.map((parameter) => (
        <div key={parameter.id} style={common.card}>
          <div style={common.cardLeft}>
            <span style={common.cardName}>{parameter.name}</span>
            {parameter.unit && <span style={common.cardType}>{parameter.unit}</span>}
            {parameter.description && <span style={common.cardType}>{parameter.description}</span>}
          </div>
          <div style={common.cardRight}>
            <span style={parameter.active ? common.badgeActive : common.badgeInactive}>
              {parameter.active ? 'Active' : 'Inactive'}
            </span>
            {parameter.active ? (
              <button
                style={common.deactivateButton}
                onClick={() => handleDeactivate(parameter.id)}
              >
                Deactivate
              </button>
            ) : (
              <button
                style={common.activateButton}
                onClick={() => handleActivate(parameter.id)}
              >
                Activate
              </button>
            )}
          </div>
        </div>
        ))}
      </div>
    </div>
  )
}

const styles = {
  heading: {
    color: 'var(--color-text-primary)',
    marginBottom: '24px',
  },
}

export default ParametersPage
