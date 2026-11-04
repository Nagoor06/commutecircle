// Only read-only ride discovery may retry automatically. A changed query or
// screen cancels both the request and its backoff; recovery has a fixed limit.
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    const aborted = () => {
      clearTimeout(timer);
      reject(signal.reason || new DOMException('Search cancelled', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }, ms);
    if (signal?.aborted) aborted();
    else signal?.addEventListener('abort', aborted, {once:true});
  });
}

export async function recoverSearch(read, signal, onStatus = () => {}) {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    try { return await read(); }
    catch (error) {
      if (signal?.aborted || attempt === 2 || ![0, 502, 503, 504].includes(error.status)) throw error;
      onStatus('The ride service may be waking up. Retrying automatically (' + (attempt + 1) + '/2)…');
      await pause(1500 * (attempt + 1), signal);
    }
  }
}
