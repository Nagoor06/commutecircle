import {distance, finitePlace} from './places.js';
import {requestPlaces, remember} from './place-provider.js';
const cache = new Map();

export const coordinatePlace = point => ({...point,
  name:point.lat.toFixed(5)+', '+point.lon.toFixed(5),
  area:'Selected meeting point · address unavailable. Check the exact pin.'});

export async function reversePlace(point, {geocoder, signal}) {
  const fallback = coordinatePlace(point);
  if (!geocoder || !finitePlace(point)) return fallback;
  const url = new URL(geocoder);
  if (!/\/api\/?$/.test(url.pathname)) return fallback;
  url.pathname = url.pathname.replace(/\/api\/?$/, '/reverse');
  url.search = new URLSearchParams({lat:point.lat,lon:point.lon,radius:'1',limit:'1',lang:'en'});
  const k = url.href;
  try {
    let match = cache.get(k);
    if (!match) {
      match = (await requestPlaces(url,signal))[0];
      if (match) remember(cache,k,match);
    }
    if (!match || distance(point,match)>1000) return fallback;
    const near = distance(point,match)>75;
    return {...point,name:(near?'Near ':'')+match.name.slice(0,near?75:80),
      area:[match.area,'Pin stays exactly where you placed it'].filter(Boolean).join(' · ')};
  } catch (e) {
    if (signal?.aborted) throw e;
    return fallback;
  }
}

// A slow lookup must never rename a newer selection or move its coordinates.
export function pinResolver({current, change, resolve, signal, delay=350}) {
  const jobs = new Map();
  const same = (a,b) => a?.lat===b?.lat && a?.lon===b?.lon;
  function cancel(index) {
    const job=jobs.get(index);
    if (job) { clearTimeout(job.timer); job.controller.abort(); jobs.delete(index); }
  }
  function sync() {
    for (const [i,job] of jobs) if (!same(current()[i],job.point) ||
      current()[i]?.name!==coordinatePlace(job.point).name) cancel(i);
  }
  function move(index,point) {
    cancel(index);
    if (signal.aborted || change(index,{...coordinatePlace(point),area:'Finding the address for this meeting point…'},false)===false) return;
    const job={point,controller:new AbortController()};
    jobs.set(index,job);
    job.timer=setTimeout(async()=>{
      try {
        const resolved=await resolve(point,job.controller.signal);
        if (!signal.aborted && jobs.get(index)===job && same(current()[index],point)) {
          jobs.delete(index);
          change(index,resolved,false);
        }
      } catch {
        if (!signal.aborted && !job.controller.signal.aborted && same(current()[index],point)) {
          jobs.delete(index); change(index,coordinatePlace(point),false);
        }
      }
    },delay);
  }
  signal.addEventListener('abort',()=>{for(const i of jobs.keys())cancel(i);},{once:true});
  return {move,sync,cancel};
}
