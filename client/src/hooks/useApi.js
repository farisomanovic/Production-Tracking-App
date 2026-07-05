/**
 * @file useApi.js
 * @description Shared list-fetching hook: one place for the loading/error/reload
 * boilerplate that the master-data pages (Operators, Machines, Products,
 * Materials, Parameters, Recipes) all need. Mutations do NOT belong here —
 * pages call the api helpers directly and then invoke reload().
 */
import { useState, useEffect, useCallback } from 'react'

/**
 * Fetches data on mount and exposes { data, loading, error, reload } so list
 * pages don't each reimplement the same three pieces of state.
 *
 * @param {Function} apiFn - Zero-argument api helper (e.g. getAllOperators). MUST be a
 * stable reference — a module-level function, not an inline arrow. An inline arrow
 * would be a new function every render, retrigger the effect, and loop forever.
 * @param {string} [errorMessage] - User-facing message stored in `error` on failure,
 * because Axios errors are too technical to render directly.
 * @returns {{ data: Array, loading: boolean, error: string|null, reload: Function }}
 * `data` starts as [] so pages can .map() before the first response arrives.
 *
 * @example
 * const { data: machines, loading, error, reload } = useApi(getAllMachines, 'Failed to load machines')
 * // after a mutation:
 * await createMachine({ name: 'Extruder 3' }); reload()
 */
export function useApi(apiFn, errorMessage = 'Failed to load data') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiFn()
      setData(response.data)
      // Cleared on success so a stale banner from a previous failure disappears
      // after a successful manual reload.
      setError(null)
    } catch (err) {
      setError(errorMessage)
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [apiFn, errorMessage])

  useEffect(() => {
    async function load() {
      await reload()
    }
    load()
  }, [reload])

  return { data, loading, error, reload }
}
