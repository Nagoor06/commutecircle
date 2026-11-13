import {
  vectorBase
} from './vector-base.js';
import {pinResolver, reversePlace} from '../data/reverse-geocoder.js';
import {
  icon
} from '../ui.js';
import {
  finitePlace,
  distance
} from '../data/places.js';
import {leaflet} from './leaflet.js';
const routeCache = new Map();
const coords = p => [p.lat, p.lon];
const tag = i => i ? 'B' : 'A';
export function mapFrame() {
  return `<section class="atlas" aria-label="Route map"><div class="canvas" data-canvas aria-label="Map showing pickup and drop-off"></div>
    <div class="atlas-badge">${icon('layers',15)} Route map</div>
    <div class="atlas-controls"><button class="map-tool" aria-label="Zoom in" data-zoom="in">${icon('plus')}</button><button class="map-tool" aria-label="Zoom out" data-zoom="out">${icon('minus')}</button><button class="map-tool" aria-label="Fit selected stops" data-fit>${icon('fit')}</button></div>
    <div class="atlas-attribution"><a href="https://openfreemap.org/" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a></div>
    <div class="atlas-footer"><div class="atlas-caption"><span class="route-symbol">${icon('route',20)}</span><div><b data-route-kind>Trip overview</b><small data-geometry>Select stops to see your route</small></div></div><button class="text-btn" data-road disabled>Road preview ${icon('arrow',15)}</button></div>
    <small class="map-message" data-map-msg role="status"></small></section>`;
}
export async function attachMap(host, {
  points,
  change,
  signal,
  geocoder
}) {
  const msg = host.querySelector('[data-map-msg]');
  let L;
  try {
    L = await leaflet()
  } catch (e) {
    msg.textContent = e.message;
    return {
      update() {}
    }
  }
  if (signal.aborted) return {
    update() {}
  };
  const map = L.map(host.querySelector('[data-canvas]'), {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
    keyboard: true,
    zoomSnap: .25,
    zoomDelta: 1,
    preferCanvas: false,
    maxZoom: 19,
    minZoom: 2
  });
  const tiles = vectorBase(L, signal).addTo(map);
  let good = 0,
    bad = 0;
  tiles.on('loading', () => {
    good = 0;
    bad = 0
  });
  tiles.on('tileload', () => {
    good++
  });
  tiles.on('tileerror', () => {
    bad++
  });
  tiles.on('load', () => {
    if (bad && !good) msg.textContent = 'Street tiles are unavailable. The pins still work.';
    else if (msg.textContent.startsWith('Street tiles')) msg.textContent = ''
  });
  const halo = L.polyline([], {
    color: '#ffffff',
    opacity: .95,
    weight: 8,
    lineCap: 'round',
    interactive: false
  }).addTo(map);
  const line = L.polyline([], {
    color: 'var(--brand)',
    opacity: 1,
    weight: 4,
    dashArray: '7 8',
    lineCap: 'round',
    interactive: false
  }).addTo(map);
  let marks = [],
    pending, revision = 0,
    localPoints = points().map(p => ({
      ...p
    }));
  const road = host.querySelector('[data-road]');
  const resolver = pinResolver({current:points, change, signal,
    resolve:(point, requestSignal)=>reversePlace(point,{geocoder,signal:requestSignal})});

  function label(kind, cue) {
    host.querySelector('[data-route-kind]').textContent = kind;
    host.querySelector('[data-geometry]').textContent = cue
  }

  function direct() {
    const ps = localPoints.filter(finitePlace).map(coords);
    halo.setLatLngs(ps);
    line.setLatLngs(ps).setStyle({
      dashArray: '7 8'
    });
    if (ps.length === 2) {
      const km = distance(...localPoints) / 1000;
      label('Stop connection', km.toFixed(1) + ' km straight-line distance')
    } else if (ps.length) label('One stop selected', 'Choose the other stop to see your route');
    else label('Route map', 'Search for a stop or choose a point on the map');
    road.disabled = ps.length !== 2;
  }

  function fit() {
    const ps = localPoints.filter(finitePlace).map(coords);
    if (ps.length === 2) {
      // Fit across the date line rather than the long way around the world.
      if (Math.abs(ps[1][1] - ps[0][1]) > 180) ps[1][1] += ps[1][1] < ps[0][1] ? 360 : -360;
      map.fitBounds(ps, {
        paddingTopLeft: [52, 72],
        paddingBottomRight: [56, 50],
        maxZoom: 16,
        animate: false
      });
    } else if (ps.length) map.setView(ps[0], 14);
    else map.fitWorld({animate:false});
  }

  function buildMarker(i) {
    const marker = L.marker([0, 0], {
      draggable: true,
      keyboard: true,
      autoPan: true,
      riseOnHover: true,
      title: 'Move ' + (i ? 'drop-off' : 'pickup') + ' pin',
      icon: L.divIcon({
        className: 'route-marker ' + (i ? 'finish' : 'start'),
        iconSize: [42, 48],
        iconAnchor: [21, 48],
        html: `<span class="map-marker-body"><span>${tag(i)}</span></span><i></i>`
      })
    });
    marker.on('dragstart', () => {
      resolver.cancel(i);
      revision++;
      pending?.abort();
      msg.textContent = ''
    });
    marker.on('drag', () => {
      const p = marker.getLatLng();
      localPoints[i] = {
        lat: p.lat,
        lon: p.wrap().lng
      };
      direct()
    });

    function commit(pos) {
      initialized=false;
      const p = pos.wrap();
      resolver.move(i, {
        lat: Math.max(-85, Math.min(85, p.lat)),
        lon: p.lng
      })
    }
    marker.on('dragend', () => commit(marker.getLatLng()));
    marker.on('add', () => {
      const node = marker.getElement();
      node.setAttribute('aria-label', 'Move ' + (i ? 'drop-off' : 'pickup') + ' pin');
      node.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight');
      node.onkeydown = e => {
        const d = {
          ArrowUp: [0, -12],
          ArrowDown: [0, 12],
          ArrowLeft: [-12, 0],
          ArrowRight: [12, 0]
        } [e.key];
        if (!d) return;
        e.preventDefault();
        e.stopPropagation();
        commit(map.containerPointToLatLng(map.latLngToContainerPoint(marker.getLatLng()).add(d)))
      };
    });
    return marker;
  }
  map.on('click', ({latlng}) => {
    const index = points().findIndex(point => !finitePlace(point));
    if (index < 0) return;
    const p = latlng.wrap();
    if (finitePlace({lat:p.lat, lon:p.lng})) resolver.move(index, {lat:p.lat, lon:p.lng});
  });
  marks = [buildMarker(0), buildMarker(1)];
  let autoTimer, initialized=false;

  function update(autofit = true) {
    resolver.sync();
    const next=points();
    const changed=!initialized || next.some((p,i)=>p.lat!==localPoints[i]?.lat || p.lon!==localPoints[i]?.lon);
    initialized=true;
    if(changed){revision++;pending?.abort();}
    localPoints = points().map(p => ({
      ...p
    }));
    if(changed)msg.textContent = '';
    if (autofit) fit();
    localPoints.forEach((p, i) => {
      const marker = marks[i];
      if (!finitePlace(p)) {
        marker.remove();
        return
      }
      let lon = p.lon;
      const mid = map.getCenter().lng;
      lon += 360 * Math.round((mid - lon) / 360);
      marker.setLatLng([p.lat, lon]);
      if (!map.hasLayer(marker)) marker.addTo(map);
      if (marker.getTooltip()) marker.unbindTooltip();
      const caption = document.createElement('span');
      caption.textContent = p.name;
      marker.bindTooltip(caption, {
        permanent: true,
        direction: i ? 'left' : 'right',
        offset: [i ? -17 : 17, -26],
        className: 'stop-label'
      });
    });
    if(changed){
      direct();
      clearTimeout(autoTimer);
      if(localPoints.length===2 && localPoints.every(finitePlace)){
        autoTimer=setTimeout(()=>{if(!signal.aborted)road.click();},650);
      }
    }
  }

  function showRoad(result) {
    const geometry = result.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
    halo.setLatLngs(geometry);
    line.setLatLngs(geometry).setStyle({
      dashArray: null
    });
    label('Driving route', (result.distance / 1000).toFixed(1) + ' km · ' + Math.round(result.duration /
      60) + ' min estimated');
    msg.textContent = '';
  }
  road.onclick = async () => {
    const snapshot = ++revision;
    const key = localPoints.map(p => p.lon.toFixed(5) + ',' + p.lat.toFixed(5)).join(';');
    if (routeCache.has(key)) {
      showRoad(routeCache.get(key));
      return
    }
    pending?.abort();
    const req = new AbortController();
    pending = req;
    const timer = setTimeout(() => req.abort(), 6500);
    road.disabled = true;
    msg.textContent = 'Finding a road route…';
    try {
      const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + key +
        '?overview=simplified&geometries=geojson&steps=false', {
          signal: req.signal
        });
      if (!r.ok) throw Error();
      const data = await r.json();
      const result = data.routes?.[0];
      if (data.code !== 'Ok' || !result?.geometry?.coordinates?.length || !Number.isFinite(result
          .distance)) throw Error();
      if (snapshot !== revision || signal.aborted) return;
      if (routeCache.size >= 12) routeCache.delete(routeCache.keys().next().value);
      routeCache.set(key, result);
      showRoad(result);
    } catch {
      if (snapshot === revision && !signal.aborted) msg.textContent =
        'Road directions are unavailable. Showing the straight-line connection.'
    } finally {
      clearTimeout(timer);
      if (snapshot === revision && !signal.aborted) road.disabled = false
    }
  };
  host.querySelector('[data-fit]').onclick = fit;
  host.querySelector('[data-zoom=in]').onclick = () => map.zoomIn();
  host.querySelector('[data-zoom=out]').onclick = () => map.zoomOut();
  const observer = new ResizeObserver(() => {
    if (!signal.aborted) {
      map.invalidateSize({
        pan: false
      });
      fit()
    }
  });
  observer.observe(host.querySelector('[data-canvas]'));
  update();
  signal.addEventListener('abort', () => {
    clearTimeout(autoTimer);
    revision++;
    pending?.abort();
    observer.disconnect();
    map.remove()
  }, {
    once: true
  });
  return {
    update
  };
}
