import {filtersMarkup, bindFilters} from '../components/search-filters.js';
import {rideHref} from '../components/ride-summary.js';
import {fare, pickupAt} from '../data/segments.js';
import {money, clock, head, icon, esc, notice, dateInput} from '../ui.js';
import {stopFromPlace, isSame} from '../data/places.js';
import {mapFrame, attachMap} from '../components/map.js';
import {fieldMarkup, attachField} from '../components/place-field.js';
import {bindPickupLocation, pickupLocationControl} from '../components/pickup-location.js';

export async function mount({root, state, api, auth, geocoder, go, signal}) {
  const points = state.route;
  if (!state.date || state.date < dateInput()) state.date = dateInput();
  let filters = {...(state.query || {}), prefer_commute:auth.signed};
  delete filters.origin; delete filters.destination; delete filters.after; delete filters.before; delete filters.offset;
  root.innerHTML = head('Passenger / Plan a trip', 'Book a ride', 'Join a journey someone already plans to make.') +
    `<div class="find-layout"><section class="planner-card"><div class="section-index"><span class="index-dot"></span> Journey planner</div>
      <div class="form-title"><h2>Where are you headed?</h2></div>
      <div class="stop-stack">${fieldMarkup(0,points[0])}<button class="swap-btn" data-swap aria-label="Swap pickup and drop-off">${icon('swap',16)}</button>${fieldMarkup(1,points[1])}</div>
      ${pickupLocationControl()}
      <label class="date-row"><span>Travel date</span><input type="date" aria-label="Travel date" min="${dateInput()}" value="${esc(state.date)}" required></label>
      ${filtersMarkup(filters)}
      <button type="button" class="text-btn" data-commute hidden>Use my saved commute</button>
      <a class="text-btn" href="#/profile">${icon('shield',16)} Set up my private office commute</a>
      <p class="fine">Your current location gives an approximate pickup area. Choose a public meeting point for boarding.</p>
      <div data-notice role="status" hidden></div>
      <button data-find class="btn primary wide">${icon('search')} View matching rides ${icon('arrow')}</button>
      <button data-browse class="browse-all">Browse rides on this date ${icon('chevron',14)}</button>
    </section>${mapFrame()}</div>
    <section class="auto-results" aria-label="Matching rides" aria-live="polite"><div class="auto-heading"><div class="eyebrow"><i></i><span data-match-heading>Available rides</span></div><span data-match-count></span></div><div data-matches></div></section>`;

  const fields = [];
  const date = root.querySelector('.date-row input');
  const matches = root.querySelector('[data-matches]');
  const count = root.querySelector('[data-match-count]');
  const heading = root.querySelector('[data-match-heading]');
  const info = message => notice(root, message, message ? 'info' : '');
  let map, locator, matchTimer, matchRequest, matchVersion = 0;

  function set(i, point, fit = true) {
    if (isSame(point, points[1-i])) {
      info('Choose two different meeting points.');
      map?.update(false);
      return false;
    }
    if (i === 0 && point.source !== 'device') locator?.cancel();
    points[i] = point;
    fields[i].set(point);
    map?.update(fit);
    info('');
    scheduleMatches();
    return true;
  }

  function useRoute(pickup, dropoff) {
    locator?.cancel();
    points.splice(0, 2, pickup, dropoff);
    fields.forEach((field, i) => field.set(points[i]));
    map?.update();
    info('');
    scheduleMatches();
  }
  root.querySelectorAll('[data-field]').forEach((el, i) => fields.push(attachField(el, {
    initial:points[i], anchor:() => points[1-i], update:p => set(i, p),
    onNearby:() => { if (i === 0) locator?.cancel(); },
    onDraft:() => {
      if (i === 0) locator?.cancel();
      try { points[i] = fields[i].value(); } catch { points[i] = {name:''}; }
      map?.update(false);
      scheduleMatches();
    }, geocoder, info, signal
  })));
  bindFilters(root, value => { filters = {...filters, ...value}; scheduleMatches(); });
  date.onchange = () => { state.date = date.value; scheduleMatches(); };

  function range() {
    const start = new Date(date.value + 'T00:00:00'), end = new Date(start);
    end.setDate(end.getDate()+1);
    return {after:start.toISOString(), before:end.toISOString()};
  }

  function query(stops) {
    return {...filters, ...range(),
      ...(stops[0]?.name ? {origin:stopFromPlace(stops[0])} : {}),
      ...(stops[1]?.name ? {destination:stopFromPlace(stops[1])} : {})};
  }

  function showRides(response, complete) {
    count.textContent = response.items.length + (response.more ? '+' : '') + ' available';
    matches.replaceChildren();
    if (!response.items.length) {
      matches.textContent = complete ? 'No available rides for these stops and day. Try a nearby stop or browse all rides.' :
        'No available routes for this search. Choose a different stop or travel date.';
      return;
    }
    for (const {journey:j, board, alight} of response.items.slice(0, 3)) {
      const a = j.stops[board], b = j.stops[alight];
      const item = document.createElement(complete ? 'a' : 'button');
      item.className = 'match-chip';
      item.textContent = a.name+' → '+b.name+' · '+clock(pickupAt(j,board))+' · '+money(fare(j,board,alight));
      if (complete) item.href = rideHref(j.id, board, alight);
      else {
        item.type = 'button';
        item.onclick = () => useRoute(stopFromPlace(a), stopFromPlace(b));
      }
      matches.append(item);
    }
  }

  function scheduleMatches() {
    const version = ++matchVersion;
    clearTimeout(matchTimer);
    matchRequest?.abort();
    count.textContent = '';
    const complete = !!(points[0].name && points[1].name);
    heading.textContent = complete ? 'Route matches' : points[0].name ? 'Rides from your pickup' :
      points[1].name ? 'Rides to your drop-off' : 'Available rides on this date';
    if (!date.validity.valid) { matches.textContent = 'Choose today or a future travel date.'; return; }
    if (complete && isSame(...points)) { matches.textContent = 'Choose two different stops to see matching rides.'; return; }
    if (!api) { matches.textContent = auth.problem || 'The booking service is currently unavailable.'; return; }
    matches.textContent = 'Checking available seats…';
    matchTimer = setTimeout(async () => {
      const q = query(points);
      if (complete) state.query = q;
      const req = new AbortController();
      matchRequest = req;
      try {
        const response = await api.search(q, req.signal, message => {
          if (version === matchVersion && !signal.aborted) matches.textContent = message;
        });
        if (version === matchVersion && !signal.aborted) showRides(response, complete);
      } catch (error) {
        if (version === matchVersion && !signal.aborted) matches.textContent = error.message;
      }
    }, 420);
  }
  signal.addEventListener('abort', () => { clearTimeout(matchTimer); matchRequest?.abort(); }, {once:true});

  function search(browse = false) {
    try {
      if (!date.validity.valid) throw Error('Choose today or a future travel date.');
      if (!browse) {
        const [a, b] = fields.map(field => field.value());
        if (isSame(a, b)) throw Error('Choose two different meeting points.');
        points.splice(0, 2, a, b);
      }
      state.query = query(browse ? [] : points);
      go('results');
    } catch (error) { info(error.message); }
  }
  root.querySelector('[data-find]').onclick = () => search();
  root.querySelector('[data-browse]').onclick = () => search(true);
  root.querySelector('[data-swap]').onclick = () => useRoute(points[1], points[0]);

  const commute = root.querySelector('[data-commute]');
  if (auth.signed && api) {
    function showCommute(saved) {
      if (signal.aborted || !saved?.pickup || !saved.workplace) return;
      state.commute = saved;
      commute.hidden = false;
      commute.onclick = () => useRoute(saved.pickup, saved.workplace);
    }
    if (state.commute === undefined) api.commute(signal).then(showCommute).catch(()=>{});
    else showCommute(state.commute);
  }
  locator = bindPickupLocation(root, {
    signal, auto:!points[0].name,
    apply:point => set(0, point),
    describe:(point, text) => {
      if (points[0] !== point) return;
      point.area = text;
      fields[0].describe(text);
    }
  });
  scheduleMatches();
  map = await attachMap(root.querySelector('.atlas'), {points:() => points, change:set, signal, geocoder});
}
