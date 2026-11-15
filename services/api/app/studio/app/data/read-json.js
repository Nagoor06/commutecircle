// Bound asset reads as well as API reads: an unfinished download must not freeze a screen.
export async function readJson(url, {signal, timeout=5000, cache}={}) {
  if(signal?.aborted)throw signal.reason;
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  signal?.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(cancel,timeout);
  try {
    const response=await fetch(url,{signal:controller.signal,...(cache?{cache}:{})});
    if(!response.ok)throw Error('This information could not be loaded. Please try again.');
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',cancel);
  }
}
