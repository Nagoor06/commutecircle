import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, interval = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    let busy = false;
    async function read() {
      if (busy || abort.signal.aborted) return;
      busy = true;
      try {
        const next = await load(abort.signal);
        if (!abort.signal.aborted) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (!abort.signal.aborted) setError(e instanceof Error ? e.message : 'Please retry.');
      } finally {
        busy = false;
        if (!abort.signal.aborted) setLoading(false);
      }
    }
    setLoading(true);
    void read();
    const tick = () => {
      if (AppState.currentState === 'active') void read();
    };
    const timer = interval ? setInterval(tick, interval) : undefined;
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'active') void read();
    });
    return () => {
      abort.abort();
      clearInterval(timer);
      listener.remove();
    };
  }, [load, interval, version]);
  return { data, error, loading, refresh };
}

// Ignore repeated taps synchronously. Server mutation IDs handle a lost response.
export function useAction() {
  const active = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const run = async (job: () => Promise<void>) => {
    if (active.current) return;
    active.current = true;
    setBusy(true);
    setError('');
    try {
      await job();
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'Please retry.');
    } finally {
      active.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, error, run };
}
