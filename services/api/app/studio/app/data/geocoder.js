import {places, normal, parseCoordinates, finitePlace, distance} from './places.js';
import {nearbyPublicStops} from './public-stops.js';
import {requestPlaces, remember} from './place-provider.js';
import {readJson} from './read-json.js';

const shards = new Map(), remoteCache = new Map();
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
  const ordered = items.filter(finitePlace).sort((a,b) =>
    (nearby ? distance(a,anchor)-distance(b,anchor) : 0) ||
    relevance(a,q)-relevance(b,q) || a.name.localeCompare(b.name));
  for (const p of ordered) {
    // Same-named stations in different cities remain separate choices.
    if (!found.some(f => finitePlace(f) && finitePlace(p) &&
      distance(f,p) < (key(f.name) === key(p.name) ? 100 : 15))) found.push(p);
  }
  return found.slice(0,6);
}

export function automaticMatches(items, q, anchor) {
  return {items:rankPlaces(items,q,anchor)};
}

export function describeMatches(items, anchor) {
  return items.map(p => ({...p, area: [p.area, finitePlace(anchor) ?
    `${(distance(p,anchor)/1000).toFixed(1)} km from search area (straight line)` : ''].filter(Boolean).join(' · ')}));
}

export function immediateMatches(q, anchor) {
  const n = key(q);
  if (!n && !finitePlace(anchor)) return [];
  return rankPlaces(places.filter(p => !n || key(p.name+' '+p.area).includes(n)), q, anchor);
}

async function stations(q, signal, anchor) {
  const letter = key(q)[0];
  if (!/^[a-z0-9]$/.test(letter)) return [];
  let rows = shards.get(letter);
  if (!rows) {
    rows = await readJson(new URL('../../assets/stations/'+letter+'.json', import.meta.url), {signal});
    remember(shards, letter, rows, 8);
  }
  const needle = key(q);
  return rankPlaces(rows.filter(([name,code]) => rank(name,code,needle)<9)
    .map(([name,code,lat,lon]) => ({name,code,lat,lon,area:'Railway station area · '+code})),q,anchor);
}

export async function suggest(q, {signal, onLocal=()=>{}, geocoder, anchor}) {
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
      return {items:await nearbyPublicStops(anchor,signal,{radius:Infinity,limit:6})};
    } catch (e) {
      if (signal?.aborted) throw e;
      return {items:immediateMatches('',anchor),offline:true};
    }
  }
  let railway = [];
  try { railway = await stations(q,signal,anchor); }
  catch (e) { if (signal?.aborted) throw e; }
  const local = [...immediateMatches(q,anchor),...railway];
  onLocal(automaticMatches(local,q,anchor).items);
  if (q.length<2 || !geocoder) return automaticMatches(local,q,anchor);
  // Bias and provider are in the cache key; swapping stops cannot reuse stale ordering.
  const bias = finitePlace(anchor) ? {lat:anchor.lat.toFixed(4),lon:anchor.lon.toFixed(4),zoom:'10',location_bias_scale:'0.1'} : {};
  const lookup = async params => {
    const cacheKey = geocoder+'|'+key(q)+'|'+JSON.stringify(params);
    if (remoteCache.has(cacheKey)) return remoteCache.get(cacheKey);
    const url = new URL(geocoder);
    url.search = new URLSearchParams({q,limit:'20',lang:'en',countrycode:'IN',...params});
    const found = (await requestPlaces(url,signal)).filter(p=>p.countryCode==='IN');
    remember(remoteCache,cacheKey,found);
    return found;
  };
  let nearby = [];
  try {
    nearby = await lookup(bias);
    const first = automaticMatches([...local,...nearby],q,anchor);
    onLocal(first.items);
    return first;
  } catch (e) {
    if (signal?.aborted) throw e;
    return {...automaticMatches([...local,...nearby],q,anchor),offline:true};
  }
}
