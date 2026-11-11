import {bindEarlierTrips} from '../components/earlier-trips.js';
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
  ticketProgress,
  pickupAt
} from '../data/segments.js';
import {
  rideHref,
  checkoutHref
} from '../components/ride-summary.js';
import {
  cancelJourney,
  cancelTicket
} from '../components/ticket-actions.js';
export async function mount(ctx) {
  if (!ctx.api || !ctx.auth.signed) return access(ctx, 'My trips', 'Sign in to manage your reservations and offers.');
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
    ${api.mode==='live'?`<details class="panel previous"><summary>${driving?'Earlier driver-approved offers':'Earlier seat requests'}</summary><div data-legacy></div></details>`:''}`;
  const list = root.querySelector('.trip-list');
  if (ctx.auth.approvals) root.insertAdjacentHTML('beforeend','<p class="fine"><a href="#/recurring">Manage recurring rides</a> · <a href="#/circles">My circles</a> · <a href="#/safety">Safety reports</a></p>');
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
      const rows = await api.allMine(signal);
      if (signal.aborted || id !== generation) return;
      const items = [];
      for (const j of rows) {
        if (j.owner !== driving) continue;
        if (driving) {
          const past = j.cancelled || pickupAt(j, j.stops.length - 1) <= Date.now();
          if (past === history) items.push([j, null]);
        } else
          for (const t of j.tickets) {
            const past = ticketProgress(j,t).past;
            if (past === history) items.push([j, t]);
          }
      }
      const expanded = new Set([...list.querySelectorAll('.passengers[open]')].map(d=>d.dataset.journey));
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
        const progress = t && ticketProgress(j,t);
        const status = t ? progress.label : j.cancelled ? 'Cancelled' : history ? 'Finished' : 'Listed';
        const card = document.createElement('article');
        card.className = 'panel trip-card';
        card.innerHTML =
          `<div class="trip-card-top"><p class="eyebrow">${driving?'Driver':'Passenger'} · ${esc(day(pickupAt(j,a)))}</p><span class="pill">${esc(status)}</span></div><h2>${esc(j.stops[a].name)} → ${esc(j.stops[b].name)}</h2>
          <p class="muted">${esc(clock(pickupAt(j,a)))} pickup · ${t?'Segment '+money(t.fare_paise)+' · Refund '+money(t.refund_paise):'Full-route seat '+money(j.price_paise)}</p>
          <div class="button-row"><a class="btn secondary compact" href="${esc(t?checkoutHref(j.id,t.id):rideHref(j.id))}">${t?(t.state==='held'?'Continue checkout':'View receipt'):'View itinerary'}</a></div>`;
        const actions = card.querySelector('.button-row');
        if(t?.state==='requested') actions.insertAdjacentHTML('beforeend','<p>Awaiting driver approval. No payment has been taken.</p>');
        if(progress?.chat) actions.insertAdjacentHTML('beforeend', `<a class="btn secondary compact" href="#/chat/${j.id}/${t.id}">Booking chat</a>`);
        if(progress?.share) actions.insertAdjacentHTML('beforeend', `<a class="btn secondary compact" href="#/track-driver/${j.id}/${t.id}">Track vehicle</a>`);
        if((driving && !history && !j.cancelled) || progress?.share) actions.insertAdjacentHTML('beforeend', `<a class="btn secondary compact" href="#/share/${j.id}${t?'?ticket='+t.id:''}">Share my trip</a>`);
        if (driving && !j.cancelled && !j.tickets.some(t=>t.travel_state==='boarded') && Date.parse(j.departure) > Date.now()) button(actions,
          'Cancel ride', async () => {
            if (await cancelJourney(api, j)) await refresh()
          }, true);
        if (t && (
          t.travel_state === 'completed' ||
          (!t.travel_state && ['exited', 'paid'].includes(t.state) &&
           (t.state === 'exited' || pickupAt(j, t.alight) <= Date.now()))
        )) {
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
        if (driving && j.booking_mode==='approval' && j.tickets.some(t=>t.state==='requested')) {
          const requests=document.createElement('div');
          requests.className='panel';
          requests.innerHTML='<p><b>Pending seat requests</b></p>';
          for(const req of j.tickets.filter(t=>t.state==='requested')){
            const row=document.createElement('div');
            row.className='passenger-row';
            row.innerHTML='<p>'+esc(j.stops[req.board].name)+' → '+esc(j.stops[req.alight].name)+' · '+money(req.fare_paise)+'</p>';
            button(row,'Approve',async()=>{await api.approve(j.id,req.id);notice(root,'Passenger approved. They must complete sandbox checkout.','info');await refresh();});
            button(row,'Decline',async()=>{await api.decline(j.id,req.id);await refresh();},true);
            requests.append(row);
          }
          card.append(requests);
        }
        if (driving && j.tickets.length) {
          const detail = document.createElement('details');
          detail.className = 'passengers';
          detail.dataset.journey = j.id;
          detail.open = expanded.has(j.id);
          detail.innerHTML = '<summary>Passenger reservations (' + j.tickets.length + ')</summary>';
          for (const ticket of j.tickets) {
            const passenger = ticketProgress(j,ticket);
            const row = document.createElement('div');
            row.className = 'passenger-row';
            row.innerHTML =
              `<b>${esc(j.stops[ticket.board].name)} → ${esc(j.stops[ticket.alight].name)}</b>
              <small>${esc(passenger.label)} · ${money(ticket.charged_paise)} charged · ${money(ticket.refund_paise)} refunded</small>`;
            if(passenger.board){
              const form=document.createElement('form');
              form.innerHTML='<label class="field">Passenger boarding PIN<input name="pin" pattern="[0-9]{6}" minlength="6" maxlength="6" inputmode="numeric" autocomplete="off" required></label><button class="btn secondary compact" type="submit">Confirm boarding</button>';
              form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{await api.board(j.id,ticket.id,form.elements.pin.value);form.elements.pin.value='';await refresh();},m=>notice(root,m,'error'));};
              row.append(form);
            }
            if(passenger.chat) row.insertAdjacentHTML('beforeend', `<a class="text-btn" href="#/chat/${j.id}/${ticket.id}">Passenger chat</a>`);
            if (passenger.cancel && ticket.state!=='requested') button(
              row, 'Cancel and refund', async () => {
                if (await cancelTicket(api, j, ticket)) await refresh()
              }, true);
            if (passenger.exit) {
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
  bindEarlierTrips(ctx, driving, history, button);
  await refresh();
}
