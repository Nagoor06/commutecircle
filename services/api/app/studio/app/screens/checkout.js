import {refreshAlerts} from '../components/booking-alerts.js';
import {stopFromPlace} from '../data/places.js';
import {travelDayRange, rememberPlan} from '../data/plan.js';
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
  dateInput,
  day,
  clock
} from '../ui.js';
import {
  pickupAt,
  ticketProgress
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
  let j = await api.detail(jid, signal);
  if (signal.aborted) return;
  let ticket = j.tickets.find(t => t.id === tid);
  if (!ticket || j.owner) throw Error('This passenger checkout is unavailable.');
  let interval, refreshTimer, generation=0, reading=false, writing=false, displayedProgress;
  signal.addEventListener('abort', () => {clearInterval(interval);clearInterval(refreshTimer)}, {
    once: true
  });

  async function changeTicket(write) {
    if(writing)return;
    writing=true;
    generation++;
    try {
      const next=await write();
      if(next && !signal.aborted){ticket=next;paint();}
    } finally {writing=false;}
  }

  function paint() {
    clearInterval(interval);
    const t = ticket;
    ctx.state.sharing.reconcile(j,t);
    const held = t.state === 'held' && Date.parse(t.expires) > Date.now(),
      state = held ? 'held' : t.state === 'held' ? 'expired' : t.state;
    const progress = ticketProgress(j, {...t, state});
    displayedProgress = JSON.stringify(progress);
    root.innerHTML = back('#/trips', 'My trips') + head('Passenger / ' + (held ? 'Checkout' : 'Receipt'),
        held ? 'Review your booking' : progress.label || 'Reservation') +
      `<div class="checkout-layout"><section class="ticket-sheet"><div class="ticket-head"><span class="eyebrow"><i></i> CommuteCircle ticket</span><b class="pill">${esc(progress.label||state)}</b></div>
      <div class="ticket-route"><span class="point-key">A</span><h2>${esc(j.stops[t.board].name)}</h2><span class="point-key orange">B</span><h2>${esc(j.stops[t.alight].name)}</h2></div>
      <dl class="specs"><div><dt>Pickup</dt><dd>${esc(day(pickupAt(j,t.board)))} · ${esc(clock(pickupAt(j,t.board)))}</dd></div><div><dt>Distance</dt><dd>${(j.stops[t.alight].metres-j.stops[t.board].metres)/1000} km</dd></div><div><dt>Reservation</dt><dd>${esc(t.id.slice(0,8).toUpperCase())}</dd></div></dl></section>
      <section class="panel checkout-pay"><div class="panel-cap">${icon('wallet')} Sandbox payment</div><div class="fare-line"><span>Segment fare</span><b>${money(t.fare_paise)}</b></div>
      <div class="ledger"><span>Charged</span><b>${money(t.charged_paise)}</b><span>Refunded</span><b>${money(t.refund_paise)}</b></div>
      ${held?`<p class="hold-clock">${icon('clock')} Seat held for <b data-clock></b></p><button data-pay class="btn primary wide">Pay ${money(t.fare_paise)} in sandbox ${icon('arrow')}</button>`:''}
      ${state==='requested'?'<p>This receipt updates when the driver decides. An approved request opens checkout for up to 15 minutes.</p>':''}
      ${state==='expired'?`<p>${t.expired_while_requested?'Your request expired before the driver approved it. No seat was reserved.':'Your hold expired. No payment was taken.'}</p><a class="btn secondary wide" href="${esc(rideHref(jid,t.board,t.alight))}">Check availability</a>`:''}
      ${progress.cancel?'<button data-cancel class="text-btn cancel">Cancel reservation</button>':''}
      ${progress.chat?`<a class="btn secondary wide" href="#/chat/${jid}/${tid}">Message driver</a>`:''}
      ${progress.share?`<a class="btn secondary wide" href="#/track-driver/${jid}/${tid}">Track vehicle</a><a class="btn secondary wide" href="#/share/${jid}?ticket=${tid}">Share my trip</a>`:''}
      ${state==='driver_cancelled'?'<button class="btn primary wide" data-alternatives>Find another ride</button>':''}
      ${progress.board?'<button type="button" data-pin class="btn secondary wide">Show boarding PIN</button><div data-pin-output role="status"></div>':state==='paid'&&t.travel_state==='awaiting_boarding'&&Date.now()<+pickupAt(j,t.board)?'<p>Your boarding PIN opens 30 minutes before pickup.</p>':''}
      ${progress.complete?'<button type="button" class="btn secondary wide" data-complete>Confirm trip complete</button>':''}
      ${ctx.auth.approvals&&['paid','exited'].includes(state)?'<a class="text-btn" href="#/safety?journey='+encodeURIComponent(jid)+'">Report a safety concern</a>':''}
      ${!held?'<a class="text-btn" href="#/trips">View my trips →</a>':''}
      ${held?'<p class="fine">Choose email or phone confirmations in <a href="#/profile">My profile</a> before booking.</p>':''}${!held||j.booking_mode==='approval'?'<section class="receipt-alerts" data-booking-alerts aria-live="polite"></section>':''}${policy()}<div data-notice role="status" hidden></div></section></div>${['paid','exited'].includes(state)?meetingMarkup(true,ctx.state.landmark):''}`;
    refreshAlerts(root.querySelector('[data-booking-alerts]'),api,jid,tid,signal);
    const pinButton=root.querySelector('[data-pin]');
    if(pinButton)pinButton.onclick=()=>pending(pinButton,async()=>{
      const result=await api.boardingPin(jid,tid);
      const output=root.querySelector('[data-pin-output]');
      if(output)output.textContent='Show this one-time PIN to the driver: '+result.pin+'. Expires '+new Date(result.expires_at).toLocaleTimeString()+'.';
    },e=>notice(root,e,'error'));
    const completeButton=root.querySelector('[data-complete]');
    if(completeButton)completeButton.onclick=()=>pending(completeButton,()=>changeTicket(async()=>{
      await api.complete(jid,tid);
      return (await api.detail(jid,signal)).tickets.find(x=>x.id===tid);
    }),e=>notice(root,e,'error'));
    const alternatives = root.querySelector('[data-alternatives]');
    if (alternatives) alternatives.onclick = () => {
      const route=[stopFromPlace(j.stops[t.board]),stopFromPlace(j.stops[t.alight])];
      const day=dateInput(new Date(Math.max(Date.now(),+pickupAt(j,t.board))));
      Object.assign(ctx.state,{route,date:day,query:{origin:route[0],destination:route[1],...travelDayRange(day)}});
      rememberPlan(ctx.state);
      ctx.go('results');
    };
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
      interval = setInterval(update, 1000);
      update();
      const pay = root.querySelector('[data-pay]');
      if (pay) pay.onclick = () => pending(pay, () => changeTicket(()=>api.pay(jid,tid)), e => notice(root,e,'error'));
    }
    const cancel = root.querySelector('[data-cancel]');
    if (cancel) cancel.onclick = () => pending(cancel, () => changeTicket(async () => {
      if (await cancelTicket(api, j, t) && !signal.aborted) {
        return (await api.detail(jid, signal)).tickets.find(x => x.id === tid);
      }
    }), e => notice(root, e, 'error'));
  }
  paint();
  refreshTimer=setInterval(async()=>{
    if(reading||writing||document.hidden||signal.aborted)return;
    reading=true;const current=generation;
    try{
      refreshAlerts(root.querySelector('[data-booking-alerts]'),api,jid,tid,signal);
      const fresh=await api.detail(jid,signal), next=fresh.tickets.find(t=>t.id===tid);
      if(!signal.aborted&&current===generation&&next&&(JSON.stringify(next)!==JSON.stringify(ticket) ||
        JSON.stringify(ticketProgress(fresh,next))!==displayedProgress)){
        j=fresh;ticket=next;paint();
      }
    }catch(e){if(!signal.aborted)notice(root,'Could not refresh the reservation. Retry from My trips.','error');}
    finally{reading=false;}
  },10000);
}
