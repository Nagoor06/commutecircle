/* Canvas cartography for OpenMapTiles. Leaflet owns gestures, zoom and projection.
   Rendering in 2D also supports devices where WebGL is disabled. */
import {
  VectorTile
} from '../../lib/vector/vector-tile.js';
import {
  PbfReader
} from '../../lib/vector/pbf.js';

const palette = {
  ground: '#f1f0e6',
  built: '#e5e7dd',
  park: '#cdddc1',
  forest: '#c1d5b5',
  farm: '#e8e8d3',
  water: '#a4ccd0',
  waterEdge: '#92bdc2',
  road: '#fffdf4',
  minorEdge: '#d6d6c8',
  major: '#f0d296',
  majorEdge: '#d5b377',
  rail: '#a0a99f',
  ink: '#536256',
  blueInk: '#4f7e83'
};
let tileInfo;
async function source() {
  if (!tileInfo) {
    tileInfo = fetch('https://tiles.openfreemap.org/planet', {
      signal: AbortSignal.timeout(6500)
    }).then(async r => {
      if (!r.ok) throw Error('Vector source unavailable');
      const j = await r.json(),
        url = j.tiles?.[0];
      if (!/^https:\/\/tiles\.openfreemap\.org\//.test(url || '')) throw Error(
        'Unexpected map source');
      return {
        url,
        max: Math.min(16, j.maxzoom || 14)
      };
    }).catch(e => {
      tileInfo = null;
      throw e
    });
  }
  return tileInfo;
}

function features(tile, name, visit) {
  const layer = tile.layers[name];
  if (!layer) return;
  for (let i = 0; i < layer.length; i++) {
    const f = layer.feature(i);
    visit(f, layer.extent)
  }
}

function drawTile(canvas, tile, coords, native) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2),
    ctx = canvas.getContext('2d');
  canvas.width = canvas.height = 256 * dpr;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, 256, 256);
  const overscale = 2 ** (coords.z - native),
    dx = (coords.x % overscale) * 256,
    dy = (coords.y % overscale) * 256,
    z = coords.z;
  const point = (pt, extent) => [pt.x / extent * 256 * overscale - dx, pt.y / extent * 256 * overscale - dy];

  function path(f, extent) {
    ctx.beginPath();
    for (const line of f.loadGeometry()) {
      for (let i = 0; i < line.length; i++) {
        const [x, y] = point(line[i], extent);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y)
      }
      if (f.type === 3) ctx.closePath()
    }
  }

  function fillLayer(name, style) {
    features(tile, name, (f, e) => {
      if (f.type !== 3) return;
      const color = style(f.properties);
      if (color) {
        path(f, e);
        ctx.fillStyle = color;
        ctx.fill('evenodd')
      }
    });
  }

  function stroke(f, e, color, width, dashes = []) {
    path(f, e);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dashes);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  fillLayer('landcover', p => p.class === 'wood' ? palette.forest : p.class === 'farmland' ? palette.farm : [
    'grass', 'scrub', 'wetland'
  ].includes(p.class) ? palette.park : null);
  fillLayer('landuse', p => ['residential', 'commercial', 'industrial'].includes(p.class) ? palette.built : [
    'park', 'cemetery', 'village_green'
  ].includes(p.class) ? palette.park : null);
  fillLayer('park', () => palette.park);
  fillLayer('water', () => palette.water);
  features(tile, 'waterway', (f, e) => {
    if (f.type === 2) stroke(f, e, palette.waterEdge, f.properties.class === 'river' ? 1.9 : 1)
  });
  if (z >= 14) fillLayer('building', () => '#d9d9cd');
  const roads = [],
    rails = [];
  features(tile, 'transportation', (f, e) => {
    if (f.type !== 2) return;
    const c = f.properties.class;
    if (c === 'rail' || c === 'transit') {
      rails.push([f, e]);
      return
    }
    if (c === 'ferry' || (z < 14 && ['path', 'track', 'service'].includes(c))) return;
    const rank = ['motorway', 'trunk'].includes(c) ? 3 : ['primary', 'secondary'].includes(c) ? 2 : c ===
      'tertiary' ? 1 : 0;
    const width = (rank === 3 ? 2.8 : rank === 2 ? 2.0 : rank === 1 ? 1.45 : .85) * Math.max(.85, Math
      .min(2.6, (z - 8) * .22));
    roads.push({
      f,
      e,
      rank,
      width
    });
  });
  roads.sort((a, b) => a.rank - b.rank);
  for (const [f, e] of rails) {
    stroke(f, e, palette.rail, z >= 13 ? 1.4 : .85);
    if (z >= 12) stroke(f, e, '#fbf9ef', .75, [4, 4])
  }
  for (const {
      f,
      e,
      rank,
      width
    }
    of roads) stroke(f, e, rank > 1 ? palette.majorEdge : palette.minorEdge, width + 1.1);
  for (const {
      f,
      e,
      rank,
      width
    }
    of roads) stroke(f, e, rank > 1 ? palette.major : palette.road, width);
  const labels = [];

  function label(text, xy, size, color, bold = false) {
    if (!text) return;
    const [x, y] = xy;
    ctx.font = (bold ? '600 ' : '') + size + 'px Arial,sans-serif';
    const w = ctx.measureText(text).width;
    const rect = [x - w / 2 - 3, y - size / 2 - 2, x + w / 2 + 3, y + size / 2 + 2];
    if (rect[0] < 1 || rect[1] < 1 || rect[2] > 255 || rect[3] > 255 || labels.some(r => rect[0] < r[2] &&
        rect[2] > r[0] && rect[1] < r[3] && rect[3] > r[1])) return;
    labels.push(rect);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f7f7ec';
    ctx.strokeText(text, x, y);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }
  const names = p => p['name:en'] || p['name_en'] || p.name;
  const places = [];
  features(tile, 'place', (f, e) => {
    if (f.type === 1) places.push([f, e])
  });
  places.sort(([a], [b]) => (a.properties.rank || 12) - (b.properties.rank || 12));
  for (const [f, e] of places) {
    const p = f.properties,
      major = ['city', 'town'].includes(p.class);
    if (!major && z < 12) continue;
    const geom = f.loadGeometry()[0]?.[0];
    if (geom) label(names(p), point(geom, e), major ? 14 : 11, palette.ink, major)
  }
  if (z >= 12) features(tile, 'transportation_name', (f, e) => {
    const p = f.properties;
    if (!names(p) && !p.ref) return;
    const pts = f.loadGeometry()[0];
    if (pts?.length) label(names(p) || p.ref, point(pts[Math.floor(pts.length / 2)], e), 9, '#7c7764');
  });
  features(tile, 'water_name', (f, e) => {
    const pts = f.loadGeometry()[0];
    if (pts?.length) label(names(f.properties), point(pts[Math.floor(pts.length / 2)], e), 10, palette
      .blueInk)
  });
}
export function vectorBase(L, signal) {
  const cache = new Map();
  const Layer = L.GridLayer.extend({
    createTile(coords, done) {
      const canvas = document.createElement('canvas');
      canvas.setAttribute('aria-hidden', 'true');
      (async () => {
        const {
          url,
          max
        } = await source();
        if (signal.aborted) return;
        const z = Math.min(coords.z, max),
          factor = 2 ** (coords.z - z),
          x = Math.floor(coords.x / factor),
          y = Math.floor(coords.y / factor);
        const key = [z, x, y].join('/');
        let request = cache.get(key);
        if (!request) {
          const path = url.replace('{z}', z).replace('{x}', x).replace('{y}', y);
          request = fetch(path, {
            signal: AbortSignal.any([signal, AbortSignal.timeout(9000)])
          }).then(async r => {
            if (!r.ok) throw Error('Map tile unavailable');
            return new VectorTile(new PbfReader(await r.arrayBuffer()));
          }).catch(e => {
            cache.delete(key);
            throw e
          });
          if (cache.size >= 80) cache.delete(cache.keys().next().value);
          cache.set(key, request);
        }
        const tile = await request;
        if (signal.aborted) return;
        drawTile(canvas, tile, coords, z);
        done(null, canvas)
      })().catch(e => {
        if (!signal.aborted) done(e, canvas)
      });
      return canvas;
    }
  });
  return new Layer({
    tileSize: 256,
    maxZoom: 19,
    keepBuffer: 1,
    updateWhenZooming: false,
    updateWhenIdle: true
  });
}
