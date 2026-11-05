import {places, normal, parseCoordinates, finitePlace, distance} from './places.js';
import {nearbyPublicStops} from './public-stops.js';
import {requestPlaces, remember} from './place-provider.js';

const shards = new Map(), remoteCache = new Map();
export const NEARBY_RADIUS = 50000;
const within = (p, anchor, radius) => !finitePlace(anchor) || distance(p,anchor) <= radius;

function bounds(anchor, radius) {
  const angle = radius / 6371000, deltaLat = angle * 180 / Math.PI;
  const deltaLon = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(anchor.lat*Math.PI/180))) * 180 / Math.PI;
  // Photon boxes cannot wrap the date line. The exact distance filter still applies.
  if (anchor.lon-deltaLon < -180 || anchor.lon+deltaLon > 180) return {};
  return {bbox:[anchor.lon-deltaLon,Math.max(-85,anchor.lat-deltaLat),anchor.lon+deltaLon,Math.min(85,anchor.lat+deltaLat)].join(',')};
}
const key = text => normal(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = s => key(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
function rank(name, code, q) {
  const n = key(name), c = key(code);
  if (!q || n === q || c === q) return 0;
  if (n.startsWith(q)) return 1;
  if (words(n).some(w => w.startsWith(q))) return 2;
  if (c.startsWith(q)) return 3;
  return 9;
}

export function rankPlaces(items, q, anchor) {
  const found = [], nearby = finitePlace(anchor);
  for (const p of items) {
    if (nearby && distance(p, anchor) < 25) continue;
    // Same-named stations in different cities remain separate choices.
    if (!found.some(f => finitePlace(f) && finitePlace(p) &&
      distance(f,p) < (key(f.name) === key(p.name) ? 100 : 15))) found.push(p);
  }
  return found.sort((a,b) => rank(a.name,a.code || '',key(q)) - rank(b.name,b.code || '',key(q)) ||
    (nearby ? distance(a,anchor)-distance(b,anchor) : 0) || a.name.localeCompare(b.name))
    .slice(0,6);
}

export function describeMatches(items, anchor) {
  return items.map(p => ({...p, area: [p.area, finitePlace(anchor) ?
    `${(distance(p,anchor)/1000).toFixed(1)} km from other stop (straight line)` : ''].filter(Boolean).join(' · ')}));
}

export function immediateMatches(q, anchor, radius = NEARBY_RADIUS) {
  const n = key(q);
  return rankPlaces(places.filter(p => within(p,anchor,radius) && (!n || key(p.name+' '+p.area).includes(n))), q, anchor);
}

async function stations(q, signal, anchor, radius) {
  const letter = key(q)[0];
  if (!/^[a-z0-9]$/.test(letter)) return [];
  let rows = shards.get(letter);
  if (!rows) {
    const response = await fetch(new URL('../../assets/stations/'+letter+'.json', import.meta.url), {signal});
    if (!response.ok) return [];
    rows = await response.json();
    remember(shards, letter, rows, 8);
  }
  const needle = key(q);
  return rankPlaces(rows.filter(([name,code]) => rank(name,code,needle)<9)
    .map(([name,code,lat,lon]) => ({name,code,lat,lon,area:'Railway station area · '+code}))
    .filter(p=>within(p,anchor,radius)),q,anchor);
}

export async function suggest(q, {signal, onLocal=()=>{}, geocoder, anchor, radius=NEARBY_RADIUS}) {
  const coordinate = parseCoordinates(q);
  if (coordinate) return {items:[coordinate]};
  if (!q && finitePlace(anchor)) {
    try {
      return {items:await nearbyPublicStops(anchor,signal,{radius,limit:6,excludeOrigin:true})};
    } catch (e) {
      if (signal?.aborted) throw e;
      return {items:immediateMatches('',anchor,radius),offline:true};
    }
  }
  let railway = [];
  try { railway = await stations(q,signal,anchor,radius); }
  catch (e) { if (signal?.aborted) throw e; }
  const local = rankPlaces([...immediateMatches(q,anchor,radius),...railway],q,anchor);
  onLocal(local);
  if (q.length<2 || !geocoder) return {items:local};
  // Bias and provider are in the cache key; swapping stops cannot reuse stale ordering.
  const bias = finitePlace(anchor) ? {lat:anchor.lat.toFixed(4),lon:anchor.lon.toFixed(4),zoom:'10',location_bias_scale:'0.1',
    ...(Number.isFinite(radius) ? bounds(anchor,radius) : {})} : {};
  const matching = remote => rankPlaces([...local,...remote.filter(p=>within(p,anchor,radius))],q,anchor);
  const cacheKey = geocoder+'|'+key(q)+'|'+JSON.stringify(bias);
  if (remoteCache.has(cacheKey)) return {items:matching(remoteCache.get(cacheKey))};
  try {
    const url = new URL(geocoder);
    url.search = new URLSearchParams({q,limit:'10',lang:'en',...bias});
    const remote = await requestPlaces(url,signal);
    remember(remoteCache,cacheKey,remote);
    return {items:matching(remote)};
  } catch (e) {
    if (signal?.aborted) throw e;
    return {items:local,offline:true};
  }
}
