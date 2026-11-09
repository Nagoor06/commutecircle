import {refreshAlerts} from '../components/booking-alerts.js';
import {stopFromPlace} from '../data/places.js';
import {
  meetingMarkup,
  bindMeeting
} from '../components/meeting.js';
import {
  access
} from '../components/access.js';
import {
  back,
  head,
  icon,
  esc,
  money,
  notice,
  pending,
  day,
  clock
} from '../ui.js';
import {
  pickupAt,
  ticketLabel
} from '../data/segments.js';
import {
  policy,
  rideHref
} from '../components/ride-summary.js';
import {
  cancelTicket
} from '../components/ticket-actions.js';
export async function mount(ctx) {
  if (!ctx.api || !ctx.auth.signed) return access(ctx, 'Checkout', 'Your reservation and receipt are private.');
  const {
    root,
    api,
    parts,
    signal
  } = ctx;
  const [jid, tid] = parts;
  root.innerHTML = '<p class="loading">Checking the reservation…</p>';
  const j = await api.detail(jid, signal);
  if (signal.aborted) return;
  let ticket = j.tickets.find(t => t.id === tid);
  if (!ticket || j.owner) throw Error('This passenger checkout is unavailable.');
  let interval, refreshTimer, generation=0, reading=false;
  signal.addEventListener('abort', () => {clearInterval(interval);clearInterval(refreshTimer)}, {
    once: true
  });

  function paint() {
    clearInterval(interval);
    const t = ticket;
    const held = t.state === 'held' && Date.parse(t.expires) > Date.now(),
      state = held ? 'held' : t.state === 'held' ? 'expired' : t.state;
    root.innerHTML = back('#/trips', 'My trips') + head('Passenger / ' + (held ? 'Checkout' : 'Receipt'),
        held ? 'Review your booking' : ticketLabel[state] || 'Reservation') +
      `<div class="checkout-layout"><section class="ticket-sheet"><div class="ticket-head"><span class="eyebrow"><i></i> CommuteCircle ticket</span><b class="pill">${esc(ticketLabel[state]||state)}</b></div>
      <div class="ticket-route"><span class="point-key">A</span><h2>${esc(j.stops[t.board].name)}</h2><span class="point-key orange">B</span><h2>${esc(j.stops[t.alight].name)}</h2></div>
      <dl class="specs"><div><dt>Pickup</dt><dd>${esc(day(pickupAt(j,t.board)))} · ${esc(clock(pickupAt(j,t.board)))}</dd></div><div><dt>Distance</dt><dd>${(j.stops[t.alight].metres-j.stops[t.board].metres)/1000} km</dd></div><div><dt>Reservation</dt><dd>${esc(t.id.slice(0,8).toUpperCase())}</dd></div></dl></section>
      <section class="panel checkout-pay"><div class="panel-cap">${icon('wallet')} Sandbox payment</div><div class="fare-line"><span>Segment fare</span><b>${money(t.fare_paise)}</b></div>
      <div class="ledger"><span>Charged</span><b>${money(t.charged_paise)}</b><span>Refunded</span><b>${money(t.refund_paise)}</b></div>
      ${held?`<p class="hold-clock">${icon('clock')} Seat held for <b data-clock></b></p><button data-pay class="btn primary wide">Pay ${money(t.fare_paise)} in sandbox ${icon('arrow')}</button>`:''}
      ${state==='expired'?`<p>Your hold expired. No payment was taken.</p><a class="btn secondary wide" href="${esc(rideHref(jid,t.board,t.alight))}">Check availability</a>`:''}
      ${['held','paid'].includes(state)&&+pickupAt(j,t.board)>Date.now()?'<button data-cancel class="text-btn cancel">Cancel reservation</button>':''}
      ${t.charged_paise?`<a class="btn secondary wide" href="#/chat/${jid}/${tid}">Message driver</a>`:''}
      ${state==='paid'?`<a class="btn secondary wide" href="#/track-driver/${jid}/${tid}">Track vehicle</a><a class="btn secondary wide" href="#/share/${jid}?ticket=${tid}">Share my trip</a>`:''}
      ${state==='driver_cancelled'?'<button class="btn primary wide" data-alternatives>Find another ride</button>':''}
      ${!held?'<a class="text-btn" href="#/trips">View my trips →</a>':''}
      ${held?'<p class="fine">Choose email or phone confirmations in <a href="#/profile">My profile</a> before booking.</p>':'<section class="receipt-alerts" data-booking-alerts aria-live="polite"></section>'}${policy()}<div data-notice role="status" hidden></div></section></div>${['paid','exited'].includes(state)?meetingMarkup(true,ctx.state.landmark):''}`;
    refreshAlerts(root.querySelector('[data-booking-alerts]'),api,jid,tid,signal);
    const alternatives = root.querySelector('[data-alternatives]');
    if (alternatives) alternatives.onclick = () => { ctx.state.query={origin:stopFromPlace(j.stops[t.board]),destination:stopFromPlace(j.stops[t.alight])}; ctx.go('results'); };
    const meeting = root.querySelector('.meeting');
    if (meeting) bindMeeting(meeting, {
      getPoint: () => j.stops[t.board],
      state: ctx.state,
      api
    });
    if (held) {
      const update = () => {
        const seconds = Math.max(0, Math.ceil((Date.parse(t.expires) - Date.now()) / 1000));
        if (seconds === 0) {
          ticket = {
            ...t,
            state: 'expired'
          };
          paint();
          return
        }
        root.querySelector('[data-clock]').textContent = Math.floor(seconds / 60) + ':' + String(seconds %
          60).padStart(2, '0');
      };
      update();
      interval = setInterval(update, 1000);
      const pay = root.querySelector('[data-pay]');
      if (pay) pay.onclick = () => pending(pay, async () => {
        generation++;
        const paid = await api.pay(jid, tid);
        if (signal.aborted) return;
        ticket = paid;
        paint()
      }, e => notice(root, e, 'error'));
    }
    const cancel = root.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = () => pending(cancel, async () => {
      generation++;
      if (await cancelTicket(api, j, t) && !signal.aborted) {
        ticket = (await api.detail(jid, signal)).tickets.find(x => x.id === tid);
        if (!signal.aborted) paint()
      }
    }, e => notice(root, e, 'error'));
  }
  paint();
  refreshTimer=setInterval(async()=>{
    if(reading||document.hidden||signal.aborted)return;
    reading=true;const current=generation;
    try{
      refreshAlerts(root.querySelector('[data-booking-alerts]'),api,jid,tid,signal);
      const fresh=await api.detail(jid,signal), next=fresh.tickets.find(t=>t.id===tid);
      if(!signal.aborted&&current===generation&&next&&JSON.stringify(next)!==JSON.stringify(ticket)){
        ticket=next;paint();
      }
    }catch(e){if(!signal.aborted)notice(root,'Could not refresh the reservation. Retry from My trips.','error');}
    finally{reading=false;}
  },10000);
}
