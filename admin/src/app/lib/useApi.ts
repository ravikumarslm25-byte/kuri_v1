import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from './api'

/** GET `path` (re-fetches when it changes). `reload()` refetches without clearing data. */
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(!!path)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!path) return
    const n = ++seq.current
    setLoading(true)
    try {
      const d = await api.get<T>(path)
      if (n === seq.current) {
        setData(d)
        setError('')
      }
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (n === seq.current) setLoading(false)
    }
  }, [path])

  useEffect(() => {
    void load()
  }, [load])

  return { data, error, loading, reload: load, setData }
}
