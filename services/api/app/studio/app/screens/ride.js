import {requestId} from '../data/id.js';
import {
  access
} from '../components/access.js';
import {
  back,
  icon,
  esc,
  money,
  clock,
  day,
  notice,
  pending
} from '../ui.js';
import {
  free,
  fare,
  pickupAt,
  validIndices
} from '../data/segments.js';
import {
  checkoutHref,
  stopList,
  vehicleBlock,
  policy
} from '../components/ride-summary.js';
export async function mount(ctx) {
  if (!ctx.api) return access(ctx, 'Ride details', 'Sign in to see the driver, route and available seats.');
  const {
    root,
    api,
    state,
    signal,
    parts,
    query,
    go
  } = ctx;
  root.innerHTML = '<p class="loading">Opening ride…</p>';
  const j = await api.detail(parts[0], signal);
  if (signal.aborted) return;
  let a = Number(query.get('a') || 0),
    b = Number(query.get('b') ?? (j.stops.length - 1));
  try {
    validIndices(j, a, b)
  } catch {
    a = 0;
    b = j.stops.length - 1
  }
  const options = stops => stops.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('');
  root.innerHTML = back('#/results', 'Available rides') + `<header class="page-head"><div class="eyebrow"><i></i> Ride details</div><h1 class="route-h1">${esc(j.stops[0].name)} <span>→</span> ${esc(j.stops.at(-1).name)}</h1><p>${esc(day(j.departure))} · ${j.owner?'Your offer':'Shared ride'}</p></header>
    <div class="details-grid"><div class="stack"><section class="panel"><div class="panel-cap">${icon('route')} Itinerary</div><div data-timeline></div></section>
    ${vehicleBlock(j)}</div>
    <aside class="panel booking-summary"><div class="section-index"><span class="index-dot"></span> Your segment</div><h2>Reserve a seat</h2>
    <label class="field">Board at<select data-from>${options(j.stops.slice(0,-1))}</select></label>
    <label class="field">Leave at<select data-to>${options(j.stops)}</select></label>
    <div data-fare></div>${policy()}<button data-book class="btn primary wide"></button>
    <small class="fine">Sandbox checkout · No real money is collected.</small>
    <div data-notice role="status" hidden></div></aside></div>`;
  const from = root.querySelector('[data-from]'),
    to = root.querySelector('[data-to]'),
    book = root.querySelector('[data-book]');

  function active(t) {
    return ['paid', 'held'].includes(t.state) && (t.state !== 'held' || Date.parse(t.expires) > Date.now())
  }

  function render() {
    from.value = a;
    [...to.options].forEach(o => o.disabled = +o.value <= a);
    to.value = b;
    root.querySelector('[data-timeline]').innerHTML = stopList(j, a, b);
    const n = free(j, a, b),
      prior = j.tickets.find(t => t.board === a && t.alight === b && active(t));
    const departed = +pickupAt(j, a) <= Date.now();
    const closed = j.cancelled || departed;
    root.querySelector('[data-fare]').innerHTML =
      `<div class="fare-line"><span>Segment fare</span><b>${money(fare(j,a,b))}</b></div><p class="meta">${(j.stops[b].metres-j.stops[a].metres)/1000} km · ${esc(clock(pickupAt(j,a)))} pickup · ${n} seats</p>`;
    book.textContent = j.owner ? 'Manage your offer' : prior ? (prior.state === 'paid' ? 'Open receipt' :
      'Continue checkout') : closed ? 'Booking closed' : n ? 'Hold one seat' : 'Segment is full';
    book.disabled = !j.owner && !prior && (closed || n < 1);
    book.onclick = () => pending(book, async () => {
      if (j.owner) {
        go('trips?view=driving');
        return
      }
      if (prior) {
        location.hash = checkoutHref(j.id, prior.id);
        return
      }
      const key = j.id + ':' + a + ':' + b;
      if (!state.checkoutKeys.has(key)) state.checkoutKeys.set(key, requestId());
      const ticket = await api.hold(j.id, a, b, state.checkoutKeys.get(key));
      if (['expired', 'rider_cancelled', 'driver_cancelled'].includes(ticket.state)) {
        state.checkoutKeys.delete(key);
        throw Error('The earlier reservation closed. Try again for a new hold.');
      }
      state.checkoutKeys.delete(key);
      if (!signal.aborted) location.hash = checkoutHref(j.id, ticket.id);
    }, e => notice(root, e, 'error'));
  }
  from.onchange = () => {
    a = +from.value;
    if (b <= a) b = a + 1;
    render()
  };
  to.onchange = () => {
    b = +to.value;
    render()
  };
  render();
}
