import {
  places,
  normal,
  parseCoordinates,
  finitePlace
} from './places.js';
const shards = new Map(),
  remoteCache = new Map();
const key = text => normal(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const words = s => key(s).split(/[^a-z0-9]+/).filter(Boolean);
const nearby = places.map(p => ({
  ...p
}));

function rank(name, code, q) {
  const n = key(name),
    c = key(code);
  if (n === q || c === q) return 0;
  if (n.startsWith(q)) return 1;
  if (words(n).some(w => w.startsWith(q))) return 2;
  if (c.startsWith(q)) return 3;
  return 9;
}

function remember(cache, k, value, limit) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(k, value)
}

function combine(groups) {
  const found = [];
  for (const p of groups.flat()) {
    if (!found.some(f => (key(f.name) === key(p.name)) || (finitePlace(f) && finitePlace(p) && Math.abs(f
        .lat - p.lat) < .0008 && Math.abs(f.lon - p.lon) < .0008))) found.push(p);
    if (found.length === 6) break;
  }
  return found;
}
export function immediateMatches(q) {
  const n = key(q);
  return n ? nearby.filter(p => key(p.name + ' ' + p.area).includes(n)) : nearby;
}
async function stations(q, signal) {
  const letter = key(q)[0];
  if (!/^[a-z0-9]$/.test(letter)) return [];
  let rows = shards.get(letter);
  if (!rows) {
    const r = await fetch(new URL('../../assets/stations/' + letter + '.json', import.meta.url), {
      signal
    });
    if (!r.ok) return [];
    rows = await r.json();
    remember(shards, letter, rows, 8)
  }
  const needle = key(q);
  return rows.map(row => ({
      row,
      score: rank(row[0], row[1], needle)
    })).filter(m => m.score < 9).sort((a, b) => a.score - b.score || a.row[0].localeCompare(b.row[0]))
    .slice(0, 5)
    .map(({
      row: [name, code, lat, lon]
    }) => ({
      name,
      area: 'Railway station area · ' + code,
      lat,
      lon
    }));
}
export async function suggest(q, {
  signal,
  onLocal,
  geocoder
}) {
  const coordinate = parseCoordinates(q);
  if (coordinate) return {
    items: [coordinate]
  };
  let railway = [];
  try {
    railway = await stations(q, signal)
  } catch (e) {
    if (signal.aborted) throw e
  }
  const local = combine([immediateMatches(q), railway]);
  onLocal(local);
  if (q.length < 3 || local.length >= 4 || !geocoder) return {
    items: local
  };
  const k = key(q);
  if (remoteCache.has(k)) return {
    items: combine([local, remoteCache.get(k)])
  };
  const controller = new AbortController(),
    abort = () => controller.abort();
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  signal.addEventListener('abort', abort, {
    once: true
  });
  const timer = setTimeout(abort, 4200);
  try {
    const url = new URL(geocoder);
    url.search = new URLSearchParams({
      q,
      limit: '5',
      lang: 'en'
    });
    const response = await fetch(url, {
      signal: controller.signal
    });
    if (!response.ok) throw Error();
    const data = await response.json();
    const remote = (data.features || []).map(f => {
      const p = f.properties || {},
        c = f.geometry?.coordinates || [];
      return {
        name: String(p.name || p.street || p.city || '').slice(0, 80),
        area: [p.city || p.district, p.state, p.country].filter(Boolean).join(' · '),
        lon: c[0],
        lat: c[1]
      };
    }).filter(p => p.name && finitePlace(p));
    remember(remoteCache, k, remote, 48);
    return {
      items: combine([local, remote])
    };
  } catch (e) {
    if (signal.aborted) throw e;
    return {
      items: local,
      offline: true
    }
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort)
  }
}
