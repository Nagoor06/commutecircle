import {icon} from '../ui.js';
import {finitePlace} from '../data/places.js';
import {nearbyPublicStops} from '../data/public-stops.js';

export const pickupLocationControl = () =>
  '<div class="pickup-location"><button type="button" class="text-btn" data-locate-pickup>'+icon('target',16)+
  ' Use current location</button><button type="button" class="text-btn" data-nearby-pickup hidden></button><small data-location-status role="status"></small></div>';

// Rider search uses a neighbourhood-sized point. Discard the precise device fix here.
let lastLookup;
function currentArea(retry) {
  if (lastLookup && (lastLookup.pending ||
      (!retry && (lastLookup.failed || Date.now() - lastLookup.time < 60000)))) {
    return lastLookup.promise;
  }
  const lookup = {pending:true, time:Date.now()};
  lastLookup = lookup;
  lookup.promise = new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(Error('Location is unavailable on this device. Enter a pickup.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(({coords}) => {
      if (!finitePlace({lat:coords.latitude, lon:coords.longitude})) {
        reject(Error('This location is outside map coverage. Enter a pickup.'));
        return;
      }
      const lat = Number(coords.latitude.toFixed(2)), lon = Number(coords.longitude.toFixed(2));
      resolve({name:'Current location', lat, lon, source:'device',
        area:'Approximate pickup area · '+lat.toFixed(2)+', '+lon.toFixed(2)});
    }, error => {
      const message = error.code === 1 ? 'Location access is off. Allow location or enter a pickup.' :
        error.code === 3 ? 'Location timed out. Try again or enter a pickup.' :
        'Couldn’t find your location. Try again or enter a pickup.';
      reject(Error(message));
    }, {enableHighAccuracy:false, maximumAge:60000, timeout:9000});
  }).catch(error => { lookup.failed = true; throw error; })
    .finally(() => { lookup.pending = false; });
  return lookup.promise;
}

export function bindPickupLocation(root, {signal, auto, apply, describe}) {
  const button = root.querySelector('[data-locate-pickup]');
  const nearby = root.querySelector('[data-nearby-pickup]');
  const status = root.querySelector('[data-location-status]');
  let version = 0;
  function cancel() {
    version++;
    nearby.hidden = true;
    button.disabled = false;
    status.textContent = '';
  }
  async function locate(retry) {
    const request = ++version;
    const current = () => !signal.aborted && request === version;
    nearby.hidden = true;
    button.disabled = true;
    status.textContent = 'Finding your pickup location…';
    let point;
    try {
      point = {...await currentArea(retry)};
    } catch (error) {
      if (current()) status.textContent = error.message;
      return;
    } finally {
      if (current()) button.disabled = false;
    }
    if (!current()) return;
    status.textContent = '';
    if (apply(point) === false) return;
    try {
      const [nearest] = await nearbyPublicStops(point, signal, {limit:1});
      if (!nearest || !current()) return;
      describe(point, 'Approximate pickup area near '+nearest.name);
      nearby.textContent = 'Use '+nearest.name;
      nearby.hidden = false;
      nearby.onclick = () => { if (current()) apply(nearest); };
    } catch {
      // The approximate pickup is usable when the local station catalogue is unavailable.
    }
  }
  button.onclick = () => locate(true);
  if (auto) locate(false);
  return {cancel};
}
