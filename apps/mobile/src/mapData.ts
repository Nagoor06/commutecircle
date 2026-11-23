import type { FeatureCollection, LineString, MultiLineString, Point as GeoPoint } from 'geojson';
import type { InitialViewState, LngLat, StyleSpecification } from '@maplibre/maplibre-react-native';
import { jsonRequest } from './api';
import { wirePlace } from './places';
import type { Place } from './types';

export const streetStyleUrl = 'https://tiles.openfreemap.org/styles/liberty';
export const offlineStyle: StyleSpecification = {
  version: 8,
  sources: { 'cc-overview': { type: 'geojson', data: require('../assets/world-land.json') } },
  layers: [
    { id: 'cc-ocean', type: 'background', paint: { 'background-color': '#c4dfed' } },
    { id: 'cc-land', type: 'fill', source: 'cc-overview', paint: { 'fill-color': '#e2eadb' } },
    { id: 'cc-coast', type: 'line', source: 'cc-overview', paint: { 'line-color': '#9aafa5', 'line-width': 0.8 } },
  ],
};

export function coordinate(place: Place): LngLat | null {
  const { lon, lat } = wirePlace(place);
  if (lon == null || lat == null || !Number.isFinite(lon) || !Number.isFinite(lat) ||
      Math.abs(lon) > 180 || Math.abs(lat) > 85) return null;
  return [lon, lat];
}

export function frame(points: LngLat[]): InitialViewState {
  if (!points.length) return { center: [0, 18], zoom: 0.65 };
  const lats = points.map((p) => p[1]);
  const longitudes = points.map((p) => p[0]).sort((a, b) => a - b);
  // Exclude the largest gap so routes over the date line fit in the short arc.
  let gap = -1, west = longitudes[0], east = west;
  longitudes.forEach((value, i) => {
    const next = longitudes[(i + 1) % longitudes.length];
    const distance = next - value + (i === longitudes.length - 1 ? 360 : 0);
    if (distance > gap) {
      gap = distance;
      west = next;
      east = value < west ? value + 360 : value;
    }
  });
  const south = Math.min(...lats), north = Math.max(...lats);
  if (east - west < 0.004 && north - south < 0.004)
    return { center: [west + (east - west) / 2, (south + north) / 2], zoom: 14 };
  return { bounds: [west, south, east, north], padding: { top: 30, bottom: 30, left: 30, right: 30 } };
}

export function pinData(points: (LngLat | null)[]): FeatureCollection<GeoPoint> {
  return { type: 'FeatureCollection', features: points.flatMap((p, i) => p ? [{
    type: 'Feature' as const, properties: { role: i === 0 ? 'pickup' : i === points.length - 1 ? 'dropoff' : 'stop' },
    geometry: { type: 'Point' as const, coordinates: p },
  }] : []) };
}

export function routeLine(points: LngLat[]): LineString | MultiLineString {
  const parts: LngLat[][] = [[]];
  for (const point of points) {
    const line = parts[parts.length - 1], prev = line[line.length - 1];
    if (prev && Math.abs(prev[0] - point[0]) > 180) {
      const boundary = prev[0] > 0 ? 180 : -180;
      const dx = point[0] + 2 * boundary - prev[0];
      const lat = dx === 0 ? prev[1] : prev[1] + (point[1] - prev[1]) * (boundary - prev[0]) / dx;
      line.push([boundary, lat]);
      parts.push([[-boundary, lat]]);
    }
    parts[parts.length - 1].push(point);
  }
  return parts.length === 1 ? { type: 'LineString', coordinates: parts[0] } :
    { type: 'MultiLineString', coordinates: parts };
}

export type Road = { distance: number; duration: number; geometry: LngLat[] };
export async function roadRoute(points: LngLat[], signal: AbortSignal): Promise<Road> {
  const path = points.map(([lon, lat]) => lon.toFixed(5) + ',' + lat.toFixed(5)).join(';');
  const response = await jsonRequest<{ code: string; routes?: {
    distance: number; duration: number; geometry?: { coordinates?: LngLat[] }
  }[] }>('https://router.project-osrm.org/route/v1/driving/' + path +
    '?overview=simplified&geometries=geojson&steps=false', { signal, timeout: 10000 });
  const route = response.routes?.[0], coords = route?.geometry?.coordinates;
  if (response.code !== 'Ok' || !route || !Number.isFinite(route.distance) || !(route.distance > 0) ||
      !Number.isFinite(route.duration) || !(route.duration > 0) || !Array.isArray(coords) || coords.length < 2 ||
      !coords.every((p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) &&
        Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) throw Error('Road route unavailable.');
  return { distance: route.distance, duration: route.duration, geometry: coords };
}
