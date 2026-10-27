import { useCallback, useEffect, useState } from 'react';

/** Run an async loader on mount (and when deps change); returns { data, error, loading, reload }. */
export function useApi(loader, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: null }));
    return run()
      .then((data) => { setState({ data, error: null, loading: false }); return data; })
      .catch((error) => setState({ data: null, error, loading: false }));
  }, [run]);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    run()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState({ data: null, error, loading: false }));
    return () => { alive = false; };
  }, [run]);

  return { ...state, reload };
}

export const pct = (v, digits = 0) => (v === null || v === undefined ? '—' : `${(v * 100).toFixed(digits)}%`);
export const slugClass = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const LEVELS = ['Not yet', 'Beginner', 'Intermediate', 'Advanced'];
