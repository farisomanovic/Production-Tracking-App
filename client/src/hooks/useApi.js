import { useState, useEffect, useCallback } from 'react'

export function useApi(apiFn, errorMessage = 'Failed to load data') {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const reload = useCallback(async () => {
    try {
      setLoading(true)
      const response = await apiFn()
      setData(response.data)
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
