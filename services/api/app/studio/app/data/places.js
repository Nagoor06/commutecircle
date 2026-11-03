// Public meeting areas, with approximate coordinates for the preview corridor.
export const places = [{
    name: 'Tenali Junction',
    area: 'Railway station · Tenali',
    lat: 16.24241,
    lon: 80.64041
  },
  {
    name: 'Vijayawada Bus Station',
    area: 'Pandit Nehru bus station area',
    lat: 16.5076,
    lon: 80.6139
  },
  {
    name: 'Mangalagiri',
    area: 'Town centre · Mangalagiri',
    lat: 16.4318,
    lon: 80.5703
  },
  {
    name: 'Guntur Junction',
    area: 'Railway station · Guntur',
    lat: 16.30078,
    lon: 80.44197
  },
  {
    name: 'Tenali Bus Stand',
    area: 'Bus station area · Tenali',
    lat: 16.2480,
    lon: 80.6500
  }
];
export const finitePlace = p => p && typeof p.lat === 'number' && typeof p.lon === 'number' && Number
  .isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 85 && Math.abs(p.lon) <= 180;
export const normal = s => String(s || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ');
export function knownPlace(name) {
  return places.find(p => normal(p.name) === normal(name))
}
export function distance(a, b) {
  const rad = Math.PI / 180;
  const v = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math
    .sin((b.lon - a.lon) * rad / 2) ** 2;
  return 12742017.6 * Math.asin(Math.sqrt(Math.min(1, v)));
}
export function parseCoordinates(text) {
  const pair = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!pair) return null;
  const value = {
    lat: Number(pair[1]),
    lon: Number(pair[2])
  };
  if (!finitePlace(value)) throw Error('Use latitude between −85 and 85 and longitude between −180 and 180.');
  return {
    ...value,
    name: 'Map pin',
    area: value.lat.toFixed(4) + ', ' + value.lon.toFixed(4)
  };
}
export function isSame(a, b) {
  return finitePlace(a) && finitePlace(b) ? distance(a, b) < 25 : normal(a?.name) === normal(b?.name);
}
export function stopFromPlace(p) {
  return {
    name: p.name,
    ...(finitePlace(p) ? {
      lat: p.lat,
      lon: p.lon
    } : {})
  }
}
