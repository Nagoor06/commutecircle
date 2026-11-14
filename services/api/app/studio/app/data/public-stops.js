import {places, distance} from './places.js';
import {readJson} from './read-json.js';
let catalogue;
export async function publicStops(signal) {
  if (!catalogue) {
    const rows = await readJson(new URL('../../assets/stations/nearby.json', import.meta.url), {signal});
    catalogue = [...places, ...rows.map(([name,lat,lon])=>({name,lat,lon,area:'Public station area'}))];
  }
  return catalogue;
}
export async function nearbyPublicStops(point, signal, {radius=5000,limit=5,excludeOrigin=false}={}) {
  const found=[];
  for (const entry of (await publicStops(signal)).map(p=>({p,d:distance(point,p)}))
    .filter(x=>x.d<=radius && (!excludeOrigin || x.d>=25)).sort((a,b)=>a.d-b.d)) {
    if (!found.some(x=>distance(x.p,entry.p)<100 && x.p.name===entry.p.name)) found.push(entry);
    if (found.length===limit) break;
  }
  return found.map(({p,d})=>({...p,area:`Public meeting area · ${(d/1000).toFixed(1)} km ${excludeOrigin?'from other stop':'away'} (straight line)`}));
}
