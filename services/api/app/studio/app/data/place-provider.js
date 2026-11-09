import {finitePlace} from './places.js';

export function providerPlace(feature) {
  const p = feature.properties || {}, c = feature.geometry?.coordinates || [];
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const name = String(p.name || street || p.locality || p.district || p.city || '').slice(0, 80);
  const area = [...new Set([street, p.locality, p.district, p.city, p.state, p.country]
    .filter(v => v && v !== name))].join(' · ');
  const place = {name, area, lon:c[0], lat:c[1], locality:
    p.osm_key === 'place' && ['city','town','village','municipality'].includes(p.osm_value)};
  return name && finitePlace(place) ? place : null;
}

export async function requestPlaces(url, signal) {
  const controller = new AbortController(), abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  signal?.addEventListener('abort', abort, {once:true});
  const timer = setTimeout(abort, 4200);
  try {
    const response = await fetch(url, {signal:controller.signal});
    if (!response.ok) throw Error('Place lookup unavailable.');
    const data = await response.json();
    return (data.features || []).map(providerPlace).filter(Boolean);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function remember(cache, key, value, limit = 48) {
  if (cache.size >= limit) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}
