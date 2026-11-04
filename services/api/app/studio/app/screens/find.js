import {filtersMarkup, bindFilters} from '../components/search-filters.js';
import {
  rideHref
} from '../components/ride-summary.js';
import {
  fare,
  pickupAt
} from '../data/segments.js';
import {
  money,
  clock
} from '../ui.js';
import {
  head,
  icon,
  esc,
  notice,
  dateInput
} from '../ui.js';
import {
  stopFromPlace,
  isSame,
  places
} from '../data/places.js';
import {
  mapFrame,
  attachMap
} from '../components/map.js';
import {
  fieldMarkup,
  attachField
} from '../components/place-field.js';
export async function mount({
  root,
  state,
  api,
  auth,
  geocoder,
  go,
  signal
}) {
  const points = state.route;
  if (!state.date || state.date < dateInput()) state.date = dateInput();
  let filters = {...(state.query || {}), prefer_commute: auth.signed};
  delete filters.origin; delete filters.destination; delete filters.after; delete filters.before; delete filters.offset;
  root.innerHTML = head('Passenger / Plan a trip', 'Book a ride',
      'Pick your stops. See who’s going your way.') +
    `<div class="find-layout"><section class="planner-card"><div class="section-index"><span class="index-dot"></span> Journey planner</div>
      <div class="form-title"><h2>Where are you headed?</h2></div>
      <div class="stop-stack">${fieldMarkup(0,points[0])}<button class="swap-btn" data-swap aria-label="Swap pickup and drop-off">${icon('swap',16)}</button>${fieldMarkup(1,points[1])}</div>
      <label class="date-row">${icon('calendar',19)}<span>Travel date</span><input type="date" aria-label="Travel date" min="${dateInput()}" value="${esc(state.date)}" required></label>
      ${filtersMarkup(filters)}
      <a class="text-btn" href="#/profile">${icon('shield',16)} Set up my private office commute</a>
      <p class="fine">Meet at public stops. The points you choose are shared with the ride. Browse without an account.</p>
      <div data-notice role="status" hidden></div>
      <button data-find class="btn primary wide">${icon('search')} View matching rides ${icon('arrow')}</button>
      <button data-browse class="browse-all">Browse rides on this date ${icon('chevron',14)}</button>
    </section>${mapFrame()}</div>
    <section class="auto-results" aria-label="Matching rides" aria-live="polite"><div class="auto-heading"><div class="eyebrow"><i></i> Route matches</div><span data-match-count></span></div><div data-matches></div></section>
    <div class="corridors"><div><div class="eyebrow"><i></i> Quick picks</div><h2>Explore a corridor</h2></div><div class="corridor-links">
      <button data-corridor="0" class="corridor"><span class="corridor-icon">${icon('route',20)}</span><span><b>Tenali → Vijayawada</b><small>Station to station</small></span>${icon('chevron',16)}</button>
      <button data-corridor="1" class="corridor"><span class="corridor-icon warm">${icon('route',20)}</span><span><b>Guntur → Vijayawada</b><small>Station to station</small></span>${icon('chevron',16)}</button>
    </div></div>`;
  const fields = [];
  let map, matchTimer, matchRequest, matchVersion = 0;
  const info = m => notice(root, m, m ? 'info' : '');

  function set(i, p, fit = true) {
    if (isSame(p, points[1 - i])) {
      info('Choose two different meeting points.');
      map?.update(false);
      return false
    }
    points[i] = p;
    fields[i]?.set(p);
    map?.update(fit);
    info('');
    scheduleMatches();
    return true;
  }
  root.querySelectorAll('[data-field]').forEach((el, i) => fields.push(attachField(el, {
    initial: points[i],
    update: p => set(i, p),
    onDraft: scheduleMatches,
    geocoder,
    info,
    signal
  })));
  const date = root.querySelector('.date-row input');
  bindFilters(root, value => { filters = {...filters, ...value}; scheduleMatches(); });
  date.onchange = () => {
    state.date = date.value;
    scheduleMatches()
  };

  function range() {
    if (!date.value) return {};
    const d = new Date(date.value + 'T00:00:00'),
      end = new Date(d);
    end.setDate(end.getDate() + 1);
    return {
      after: d.toISOString(),
      before: end.toISOString()
    };
  }

  function scheduleMatches() {
    const current = ++matchVersion;
    clearTimeout(matchTimer);
    matchRequest?.abort();
    matchTimer = setTimeout(async () => {
      const node = root.querySelector('[data-matches]'),
        count = root.querySelector('[data-match-count]');
      count.textContent = '';
      let route;
      try {
        route = fields.map(field => field.value());
        if (route.length !== 2 || isSame(...route)) throw Error()
      } catch {
        node.textContent = 'Choose two different stops to see matching rides.';
        return
      }
      if (!date.value) { node.textContent='Choose a travel date to see rides.'; return; }
      const q = {
        origin: stopFromPlace(route[0]),
        destination: stopFromPlace(route[1]),
        ...range(), ...filters
      };
      state.query = q;
      if (!api) {
        node.textContent = auth.problem || 'The booking service is currently unavailable.';
        if (auth.enabled) {
          const btn = document.createElement('button');
          btn.className = 'text-btn';
          btn.textContent = 'Sign in';
          btn.onclick = auth.login;
          node.append(' ', btn)
        }
        return
      }
      const req = new AbortController();
      matchRequest = req;
      node.textContent = 'Checking available seats…';
      try {
        const response = await api.search(q, req.signal);
        if (current !== matchVersion || signal.aborted) return;
        count.textContent = response.items.length + (response.more ? '+' : '') + ' available';
        node.replaceChildren();
        if (!response.items.length) {
          node.textContent =
            'No available rides for these stops and day. Try a nearby stop or browse all rides.';
          return
        }
        for (const {
            journey: j,
            board: a,
            alight: b
          }
          of response.items.slice(0, 2)) {
          const link = document.createElement('a');
          link.href = rideHref(j.id, a, b);
          link.className = 'match-chip';
          link.textContent = j.stops[a].name + ' → ' + j.stops[b].name + ' · ' + clock(pickupAt(j,
            a)) + ' · ' + money(fare(j, a, b));
          node.append(link);
        }
      } catch (e) {
        if (current === matchVersion && !signal.aborted) node.textContent = e.message
      }
    }, 420);
  }
  signal.addEventListener('abort', () => {
    clearTimeout(matchTimer);
    matchRequest?.abort()
  }, {
    once: true
  });

  function search(browse = false) {
    try {
      if (!date.value) throw Error('Choose a travel date.');
      if (!browse) {
        const [a, b] = fields.map(f => f.value());
        if (isSame(a, b)) throw Error('Choose two different meeting points.');
        points.splice(0, 2, a, b);
      }
      state.query = browse ? {...range(), ...filters} : {
        origin: stopFromPlace(points[0]),
        destination: stopFromPlace(points[1]),
        ...range(), ...filters
      };
      go('results');
    } catch (e) {
      info(e.message)
    }
  }
  root.querySelector('[data-find]').onclick = () => search();
  root.querySelector('[data-browse]').onclick = () => search(true);
  root.querySelector('[data-swap]').onclick = () => {
    try {
      const pair = fields.map(f => f.value()).reverse();
      points.splice(0, 2, ...pair);
      fields.forEach((f, i) => f.set(points[i]));
      map?.update();
      info('');
      scheduleMatches()
    } catch (e) {
      info(e.message)
    }
  };
  root.querySelectorAll('[data-corridor]').forEach((button, i) => button.onclick = () => {
    points.splice(0, 2, places[i ? 3 : 0], places[1]);
    fields.forEach((f, n) => f.set(points[n]));
    map?.update();
    scheduleMatches()
  });
  scheduleMatches();
  if (auth.signed && !state.commute && !state.query) {
    api.commute(signal).then(saved => {
      if (!saved || signal.aborted || matchVersion !== 1) return;
      state.commute = saved;
      points.splice(0,2,saved.pickup,saved.workplace);
      fields.forEach((f,i)=>f.set(points[i])); map?.update(); scheduleMatches();
    }).catch(()=>{});
  }
  map = await attachMap(root.querySelector('.atlas'), {
    points: () => points,
    change: set,
    signal
  });
}
