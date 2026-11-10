'use client';
// Tiny data hook: fetch on dependency change, expose reload(). Aborts stale requests.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client-api';

export function useData(url) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const ctrl = useRef(null);
  const load = useCallback(async () => {
    if (!url) return;
    ctrl.current?.abort();
    ctrl.current = new AbortController();
    setLoading(true);
    try {
      setData(await api(url, { signal: ctrl.current.signal }));
      setError('');
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally { setLoading(false); }
  }, [url]);
  useEffect(() => { load(); return () => ctrl.current?.abort(); }, [load]);
  return { data, error, loading, reload: load, setData };
}
