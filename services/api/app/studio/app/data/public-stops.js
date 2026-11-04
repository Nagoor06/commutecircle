import {places, distance} from './places.js';
let catalogue;
export async function publicStops(signal) {
  if (!catalogue) {
    const response = await fetch(new URL('../../assets/stations/nearby.json', import.meta.url), {signal});
    if (!response.ok) throw Error('Public stop suggestions are unavailable. Search by station name.');
    const rows = await response.json();
    catalogue = [...places, ...rows.map(([name,lat,lon])=>({name,lat,lon,area:'Public station area'}))];
  }
  return catalogue;
}
export async function nearbyPublicStops(point, signal) {
  return (await publicStops(signal)).map(p=>({p,d:distance(point,p)})).filter(x=>x.d<=5000)
    .sort((a,b)=>a.d-b.d).slice(0,5).map(({p,d})=>({...p,area:`Public meeting area · ${(d/1000).toFixed(1)} km away (straight line)`}));
}
