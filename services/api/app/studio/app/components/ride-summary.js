import {
  icon,
  esc,
  day,
  clock,
  money
} from '../ui.js';
import {
  fare,
  free,
  pickupAt
} from '../data/segments.js';
export const rideHref = (id, a = 0, b = null) => '#/ride/' + encodeURIComponent(id) + '?a=' + a + (b == null ?
  '' : '&b=' + b);
export const checkoutHref = (id, tid) => '#/checkout/' + encodeURIComponent(id) + '/' + encodeURIComponent(
  tid);
export const carName = v => v ? [v.make, v.model].join(' ') : 'Vehicle details pending';
export function rideCard({
  journey: j,
  board: a,
  alight: b,
  match = {}
}) {
  const from = j.stops[a],
    to = j.stops[b],
    n = free(j, a, b);
  return `<article class="ride-card">
    <div class="ride-card-head"><span class="pill">${icon('calendar',14)} ${esc(day(pickupAt(j,a)))}</span>
    <span class="meta">${j.owner?'Your offer':'Shared ride'}</span></div>
    <div class="ride-main"><div class="itinerary"><div><time>${esc(clock(pickupAt(j,a)))}</time><i></i><b>${esc(from.name)}</b></div>
      <div><time>${esc(clock(pickupAt(j,b)))}</time><i></i><b>${esc(to.name)}</b></div></div>
      <div class="card-price"><b>${money(fare(j,a,b))}</b><small>per seat</small></div></div>
    <div class="match-reasons">${match.commute?'<span class="pill">Your office commute</span>':''}${match.pickup_distance_m!=null?`<span>Pickup ${(match.pickup_distance_m/1000).toFixed(1)} km away</span>`:''}${match.dropoff_distance_m!=null?`<span>Drop-off ${(match.dropoff_distance_m/1000).toFixed(1)} km from your destination</span>`:''}${j.preferences?.quiet?`<span>${icon('quiet',14)} Quiet ride</span>`:''}${j.preferences?.air_conditioned?`<span>${icon('snowflake',14)} Air conditioning</span>`:''}</div>
    <div class="ride-foot"><span>${icon('car',16)} ${esc(carName(j.vehicle))}</span><span>${icon('seat',16)} ${n} ${n===1?'seat':'seats'}</span>
    <a class="text-btn" href="${esc(rideHref(j.id,a,b))}">View ride ${icon('arrow',15)}</a></div></article>`;
}
export function stopList(j, a, b) {
  return `<ol class="stop-list">${j.stops.map((stop,i)=>`<li class="${i<a||i>b?'muted-stop':''}"><span class="stop-time">${esc(clock(pickupAt(j,i)))}</span><i class="${i===b?'last':''}"></i><div><b>${esc(stop.name)}</b><small>${i===a?'Board here':i===b?'Leave here':(stop.metres/1000).toLocaleString()+' km from start'}</small></div></li>`).join('')}</ol>`;
}
export function vehicleBlock(j) {
  const v = j.vehicle,
    r = j.driver_rating || {
      count: 0
    };
  return `<section class="panel"><div class="panel-cap">${icon('car')} Vehicle & driver</div>
    <div class="vehicle-title"><div><h2>${esc(carName(v))}</h2><p class="muted">${'Driver rating'} · ${r.count?`${Number(r.average).toFixed(1)} / 5 (${r.count} reviews)`:'No reviews yet'}</p></div></div>
    ${v?`<dl class="specs"><div><dt>Colour</dt><dd>${esc(v.color)}</dd></div><div><dt>Purchased</dt><dd>${esc(new Date(v.purchased_on+'T12:00:00Z').toLocaleDateString('en-IN',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}))}</dd></div><div><dt>Driver-reported condition</dt><dd class="caps">${esc(v.condition)}</dd></div></dl>`:'<p class="muted">The driver hasn’t added a vehicle for this ride.</p>'}</section>`;
}
export function policy() {
  return '<details class="policy"><summary>' + icon('shield', 16) + ' Cancellation terms ' + icon('down',
    15) +
    '</summary><dl class="policy-rows"><div><dt>24 hours or more before pickup</dt><dd>Free</dd></div><div><dt>2 to under 24 hours</dt><dd>10% of segment fare</dd></div><div><dt>Under 2 hours, before pickup</dt><dd>25% of segment fare</dd></div><div><dt>Driver cancels before boarding</dt><dd>Full refund</dd></div></dl></details>';
}
