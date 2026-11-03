import {
  access
} from '../components/access.js';
import {
  head,
  icon,
  esc,
  day,
  clock,
  money,
  empty,
  notice,
  pending,
  confirmation
} from '../ui.js';
import {
  ticketLabel,
  pickupAt
} from '../data/segments.js';
import {
  rideHref,
  checkoutHref,
  vehicleBlock
} from '../components/ride-summary.js';
import {
  cancelJourney,
  cancelTicket
} from '../components/ticket-actions.js';
export async function mount(ctx) {
  if (!ctx.api) return access(ctx, 'My trips', 'Sign in to manage your reservations and offers.');
  const {
    root,
    api,
    query,
    signal
  } = ctx, driving = query.get('view') === 'driving', history = query.get('when') === 'history';
  const path = (d, h) => '#/trips?view=' + (d ? 'driving' : 'riding') + '&when=' + (h ? 'history' :
    'upcoming');
  root.innerHTML = head('Your workspace', 'My trips', 'Manage your reservations and the rides you offer.') +
    `<div class="trip-tools"><div class="tabs"><a href="${path(false,history)}" ${!driving?'aria-current="page"':''}>${icon('ticket',16)} Riding</a><a href="${path(true,history)}" ${driving?'aria-current="page"':''}>${icon('car',16)} Driving</a></div>
    <div class="tabs subtle"><a href="${path(driving,false)}" ${!history?'aria-current="page"':''}>Current</a><a href="${path(driving,true)}" ${history?'aria-current="page"':''}>History</a></div></div>
    <div data-notice role="status" hidden></div><div class="trip-list" aria-live="polite"><p class="loading">Loading trips…</p></div><button data-refresh class="text-btn">${icon('list',15)} Refresh trips</button>
    ${api.mode==='live'&&driving?'<details class="panel previous"><summary>Earlier driver-approved offers</summary><div data-legacy></div></details>':''}`;
  const list = root.querySelector('.trip-list');
  let generation = 0;

  function button(parent, title, fn, danger = false) {
    const b = document.createElement('button');
    b.className = 'btn ' + (danger ? 'quiet-danger' : 'secondary') + ' compact';
    b.textContent = title;
    b.onclick = () => pending(b, fn, e => notice(root, e, 'error'));
    parent.append(b);
  }
  async function refresh() {
    const id = ++generation;
    try {
      let rows = [],
        page = [];
      for (let offset = 0;; offset += 50) {
        page = await api.mine(offset, signal);
        if (signal.aborted || id !== generation) return;
        rows.push(...page);
        if (page.length < 50) break
      }
      const items = [];
      for (const j of rows) {
        if (j.owner !== driving) continue;
        if (driving) {
          const past = j.cancelled || pickupAt(j, j.stops.length - 1) <= Date.now();
          if (past === history) items.push([j, null]);
        } else
          for (const t of j.tickets) {
            const past = ['exited', 'expired', 'driver_cancelled', 'rider_cancelled'].includes(t.state) ||
              (t.state === 'paid' && pickupAt(j, t.alight) <= Date.now());
            if (past === history) items.push([j, t]);
          }
      }
      list.replaceChildren();
      if (!items.length) {
        list.innerHTML = empty(driving ? 'No ' + (history ? 'past' : 'current') + ' offers' : 'No ' + (
            history ? 'past' : 'current') + ' reservations',
          driving ? 'Your published rides and passenger reservations appear here.' :
          'Once you hold a seat, you can find its checkout and receipt here.',
          driving ? '#/offer' : '#/find', driving ? 'Offer a ride' : 'Find a ride')
      }
      for (const [j, t] of items) {
        const a = t?.board ?? 0,
          b = t?.alight ?? j.stops.length - 1;
        const status = t ? (t.state === 'paid' && pickupAt(j, b) <= Date.now() ? 'Completed' :
          ticketLabel[t.state]) : j.cancelled ? 'Cancelled' : history ? 'Finished' : 'Listed';
        const card = document.createElement('article');
        card.className = 'panel trip-card';
        card.innerHTML =
          `<div class="trip-card-top"><p class="eyebrow">${driving?'Driver':'Passenger'} · ${esc(day(pickupAt(j,a)))}</p><span class="pill">${esc(status)}</span></div><h2>${esc(j.stops[a].name)} → ${esc(j.stops[b].name)}</h2>
          <p class="muted">${esc(clock(pickupAt(j,a)))} pickup · ${t?'Segment '+money(t.fare_paise)+' · Refund '+money(t.refund_paise):'Full-route seat '+money(j.price_paise)}</p>
          <div class="button-row"><a class="btn secondary compact" href="${esc(t?checkoutHref(j.id,t.id):rideHref(j.id))}">${t?(t.state==='held'?'Continue checkout':'View receipt'):'View itinerary'}</a></div>`;
        const actions = card.querySelector('.button-row');
        if (driving && !j.cancelled && Date.parse(j.departure) > Date.now()) button(actions,
          'Cancel ride', async () => {
            if (await cancelJourney(api, j)) await refresh()
          }, true);
        if (t && ['exited', 'paid'].includes(t.state) && (t.state === 'exited' || pickupAt(j, t.alight) <=
            Date.now())) {
          const row = document.createElement('div');
          row.className = 'review-row';
          row.innerHTML =
            `<label class="field">Your driver rating<select>${[1,2,3,4,5].map(n=>`<option ${n===(t.stars||5)?'selected':''}>${n}</option>`).join('')}</select></label>`;
          button(row, t.stars ? 'Update review' : 'Save review', async () => {
            await api.rate(j.id, t.id, +row.querySelector('select').value);
            notice(root, 'Review saved.');
            await refresh()
          });
          card.append(row);
        }
        if (driving && j.tickets.length) {
          const detail = document.createElement('details');
          detail.className = 'passengers';
          detail.innerHTML = '<summary>Passenger reservations (' + j.tickets.length + ')</summary>';
          for (const ticket of j.tickets) {
            const row = document.createElement('div');
            row.className = 'passenger-row';
            row.innerHTML =
              `<b>${esc(j.stops[ticket.board].name)} → ${esc(j.stops[ticket.alight].name)}</b>
              <small>${esc(ticketLabel[ticket.state])} · ${money(ticket.charged_paise)} charged · ${money(ticket.refund_paise)} refunded</small>`;
            if (['held', 'paid'].includes(ticket.state) && pickupAt(j, ticket.board) > Date.now()) button(
              row, 'Cancel and refund', async () => {
                if (await cancelTicket(api, j, ticket)) await refresh()
              }, true);
            if (ticket.state === 'paid' && ticket.alight - ticket.board > 1 && pickupAt(j, ticket
              .board) <= Date.now() && pickupAt(j, ticket.alight) > Date.now()) {
              const label = document.createElement('label');
              label.className = 'field';
              label.textContent = 'Actual exit stop';
              const select = document.createElement('select');
              j.stops.slice(ticket.board + 1, ticket.alight).forEach((s, i) => select.add(new Option(s
                .name, ticket.board + 1 + i)));
              label.append(select);
              row.append(label);
              button(row, 'Confirm early exit', async () => {
                const stop = +select.value;
                if (await confirmation('Confirm passenger exit?', j.stops[stop].name +
                    ' becomes the final stop. The onward fare is refunded.', 'Confirm exit')) {
                  await api.exit(j.id, ticket.id, stop);
                  await refresh()
                }
              });
            }
            detail.append(row);
          }
          card.append(detail);
        }
        list.append(card);
      }
    } catch (e) {
      if (!signal.aborted) {
        list.innerHTML = '';
        notice(root, e.message, 'error')
      }
    }
  }
  root.querySelector('[data-refresh]').onclick = refresh;
  const previous = root.querySelector('.previous');
  if (previous) previous.ontoggle = async () => {
    if (!previous.open || previous.dataset.loaded) return;
    const target = previous.querySelector('[data-legacy]');
    target.textContent = 'Loading…';
    try {
      const rows = await api.unpriced();
      if (signal.aborted) return;
      target.replaceChildren();
      if (!rows.length) target.textContent = 'No earlier offers.';
      for (const r of rows) {
        const row = document.createElement('article');
        row.className = 'passenger-row';
        const title = document.createElement('b');
        title.textContent = 'Ride · ' + day(r.departure_at) + ' · ' + clock(r.departure_at);
        row.append(title);
        button(row, 'Vehicle & rating', async () => {
          const d = await api.oldDetail(r.id);
          row.querySelector('.old-detail')?.remove();
          const info = document.createElement('div');
          info.className = 'old-detail';
          info.innerHTML = vehicleBlock(d);
          row.append(info)
        });
        if (Date.parse(r.departure_at) > Date.now()) button(row, 'Cancel earlier ride', async () => {
          if (await confirmation('Cancel this ride?', 'This closes its active bookings.',
              'Cancel ride', {
                danger: true
              })) {
            await api.oldCancel(r.id);
            notice(root, 'Ride cancelled.')
          }
        }, true);
        target.append(row);
      }
      previous.dataset.loaded = '1';
    } catch (e) {
      target.textContent = e.message
    }
  };
  await refresh();
}
