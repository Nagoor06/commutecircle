import {finitePlace} from './places.js';

let area;
// Keep only a short-lived, approximate search bias in this page's memory.
export function rememberSearchArea(point) {
  if (!finitePlace(point)) return;
  area = {lat:Number(point.lat.toFixed(2)),lon:Number(point.lon.toFixed(2)),at:Date.now()};
}

export function searchArea(otherStop, selected) {
  if (area && Date.now()-area.at<300000) return {lat:area.lat,lon:area.lon};
  return finitePlace(otherStop) ? otherStop : finitePlace(selected) ? selected : null;
}
