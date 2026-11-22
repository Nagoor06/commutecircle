import { jsonRequest } from './api';
import type { Place, Point } from './types';
type GeoFeature = {
  geometry?: { coordinates?: number[] };
  properties?: { name?: string; city?: string; state?: string; country?: string; street?: string };
};
export type Suggestion = Place & Point & { area: string };

function coordinates(name: string): Point | undefined {
  const pair = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(name.trim());
  if (!pair) return;
  const lat = Number(pair[1]),
    lon = Number(pair[2]);
  if (Math.abs(lat) <= 85 && Math.abs(lon) <= 180) return { lat, lon };
}

export function km(a: Point, b: Point) {
  const rad = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lon - a.lon) * rad) / 2) ** 2;
  return 12742.018 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export async function suggestions(text: string, near: Point | undefined, signal: AbortSignal) {
  const entered = coordinates(text);
  if (entered) return [{ name: text.trim(), ...entered, area: 'Coordinates' }];
  const params = new URLSearchParams({ q: text.trim(), limit: '20', lang: 'en' });
  if (near) {
    params.set('lat', near.lat.toFixed(2));
    params.set('lon', near.lon.toFixed(2));
    params.set('location_bias_scale', '0.1');
    params.set('zoom', '10');
  }
  const result = await jsonRequest<{ features: GeoFeature[] }>(
    'https://photon.komoot.io/api/?' + params,
    { signal, timeout: 5500 },
  );
  const points: Suggestion[] = [];
  for (const entry of result.features ?? []) {
    const [lon, lat] = entry.geometry?.coordinates ?? [];
    const p = entry.properties;
    const name = p?.name || p?.street || p?.city;
    if (
      !name ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 85 ||
      Math.abs(lon) > 180
    )
      continue;
    const area = [...new Set([p?.city, p?.state, p?.country].filter((v) => v && v !== name))].join(', ');
    if (!points.some((v) => v.name === name && km(v, { lat, lon }) < 0.1))
      points.push({ name: name.slice(0, 80), area, lat, lon });
  }
  if (near) points.sort((a, b) => km(a, near) - km(b, near));
  return points.slice(0, 6);
}
export function wirePlace(place: Place) {
  return {
    name: place.name.trim(),
    ...(place.lat == null || place.lon == null
      ? coordinates(place.name)
      : { lat: place.lat, lon: place.lon }),
  };
}
