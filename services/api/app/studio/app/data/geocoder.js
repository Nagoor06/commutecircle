import {places, normal, parseCoordinates, finitePlace, distance} from './places.js';
import {nearbyPublicStops} from './public-stops.js';
import {requestPlaces, remember} from './place-provider.js';
import {readJson} from './read-json.js';

const shards = new Map(), remoteCache = new Map();
export const NEARBY_RADIUS = 25000;
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

function relevance(p, q) {
  const score = rank(p.name,p.code || '',key(q));
  // A named city is more useful than a business containing that city's name.
  return score * 2 - (q.length >= 3 && p.locality && score === 1 ? .5 : 0);
}

export function rankPlaces(items, q, anchor) {
  const found = [], nearby = finitePlace(anchor);
  for (const p of items) {
    if (nearby && distance(p, anchor) < 25) continue;
    // Same-named stations in different cities remain separate choices.
    if (!found.some(f => finitePlace(f) && finitePlace(p) &&
      distance(f,p) < (key(f.name) === key(p.name) ? 100 : 15))) found.push(p);
  }
  return found.sort((a,b) => relevance(a,q) - relevance(b,q) ||
    (nearby ? distance(a,anchor)-distance(b,anchor) : 0) || a.name.localeCompare(b.name))
    .slice(0,6);
}

export function automaticMatches(items, q, anchor, nationwide = false) {
  const candidates = items.filter(p=>!finitePlace(anchor) || distance(p,anchor)>=25);
  const selected = candidates.filter(p=>nationwide || within(p,anchor,NEARBY_RADIUS));
  const result = rankPlaces(selected,q,anchor);
  return {items:result, expanded:result.some(p=>!within(p,anchor,NEARBY_RADIUS))};
}

export function describeMatches(items, anchor) {
  return items.map(p => ({...p, area: [p.area, finitePlace(anchor) ?
    `${(distance(p,anchor)/1000).toFixed(1)} km from search area (straight line)` : ''].filter(Boolean).join(' · ')}));
}

export function immediateMatches(q, anchor, radius = NEARBY_RADIUS) {
  const n = key(q);
  if (!n && !finitePlace(anchor)) return [];
  return rankPlaces(places.filter(p => within(p,anchor,radius) && (!n || key(p.name+' '+p.area).includes(n))), q, anchor);
}

async function stations(q, signal, anchor, radius) {
  const letter = key(q)[0];
  if (!/^[a-z0-9]$/.test(letter)) return [];
  let rows = shards.get(letter);
  if (!rows) {
    rows = await readJson(new URL('../../assets/stations/'+letter+'.json', import.meta.url), {signal});
    remember(shards, letter, rows, 8);
  }
  const needle = key(q);
  return rankPlaces(rows.filter(([name,code]) => rank(name,code,needle)<9)
    .map(([name,code,lat,lon]) => ({name,code,lat,lon,area:'Railway station area · '+code}))
    .filter(p=>within(p,anchor,radius)),q,anchor);
}

export async function suggest(q, {signal, onLocal=()=>{}, geocoder, anchor, nationwide=false}) {
  const coordinate = parseCoordinates(q);
  if (coordinate) {
    if (!geocoder) return {items:[],offline:true};
    const url=new URL(geocoder);
    if (!/\/api\/?$/.test(url.pathname)) return {items:[]};
    url.pathname=url.pathname.replace(/\/api\/?$/,'/reverse');
    url.search=new URLSearchParams({lat:coordinate.lat,lon:coordinate.lon,radius:'1',limit:'1',lang:'en'});
    try {
      const [place]=await requestPlaces(url,signal);
      return {items:place?.countryCode==='IN' && distance(coordinate,place)<=1000 ? [coordinate] : []};
    } catch(error) {
      if(signal?.aborted)throw error;
      return {items:[],offline:true};
    }
  }
  if (!q && finitePlace(anchor)) {
    try {
      return {items:await nearbyPublicStops(anchor,signal,{radius:NEARBY_RADIUS,limit:6,excludeOrigin:true})};
    } catch (e) {
      if (signal?.aborted) throw e;
      return {items:immediateMatches('',anchor),offline:true};
    }
  }
  let railway = [];
  const radius=nationwide ? Infinity : NEARBY_RADIUS;
  try { railway = await stations(q,signal,anchor,radius); }
  catch (e) { if (signal?.aborted) throw e; }
  const local = [...immediateMatches(q,anchor,radius),...railway];
  onLocal(automaticMatches(local,q,anchor,nationwide).items);
  if (q.length<2 || !geocoder) return automaticMatches(local,q,anchor,nationwide);
  // Bias and provider are in the cache key; swapping stops cannot reuse stale ordering.
  const bias = finitePlace(anchor) ? {lat:anchor.lat.toFixed(4),lon:anchor.lon.toFixed(4),zoom:'10',location_bias_scale:'0.1',
    ...(nationwide ? {} : bounds(anchor,NEARBY_RADIUS))} : {};
  const lookup = async params => {
    const cacheKey = geocoder+'|'+key(q)+'|'+JSON.stringify(params);
    if (remoteCache.has(cacheKey)) return remoteCache.get(cacheKey);
    const url = new URL(geocoder);
    url.search = new URLSearchParams({q,limit:'10',lang:'en',countrycode:'IN',...params});
    const found = (await requestPlaces(url,signal)).filter(p=>p.countryCode==='IN');
    remember(remoteCache,cacheKey,found);
    return found;
  };
  let nearby = [];
  try {
    nearby = await lookup(bias);
    const first = automaticMatches([...local,...nearby],q,anchor,nationwide);
    onLocal(first.items);
    return first;
  } catch (e) {
    if (signal?.aborted) throw e;
    return {...automaticMatches([...local,...nearby],q,anchor,nationwide),offline:true};
  }
}
