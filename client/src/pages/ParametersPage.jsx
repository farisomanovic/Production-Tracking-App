/**
 * @file ParametersPage.jsx
 * @description Admin page for parameter definitions (create + list only —
 * editing has no UI yet even though the API supports it). Assigning parameters
 * to machines happens on MachineDetailPage, not here.
 */
import { useState } from 'react'
import { getAllParameters, createParameter } from '../api/parameters'
import { useApi } from '../hooks/useApi'
import ErrorBanner from '../components/ErrorBanner'
import { common } from '../styles/common'
import { getErrorMessage } from '../lib/errorMessage'

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
    if (!name.trim()) return
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
