import {requestId} from '../data/id.js';
import {access} from '../components/access.js';
import {head,esc,notice,pending} from '../ui.js';

const today=(days=0)=>new Date(Date.now()+19800000+days*86400000).toISOString().slice(0,10);
const localTime=iso=>new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(iso));
const weekdays=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

export async function mount(ctx){
  const {root,api,auth,signal}=ctx;
  if(!api||!auth.signed)return access(ctx,'Recurring rides','Sign in to manage weekly commutes.');
  root.innerHTML='<p class="loading">Opening recurring schedules…</p>';
  const [templates,offers,circles,eligibility]=await Promise.all([api.recurringRides(signal),api.allMine(signal),api.circles(signal),api.driverEligibility(signal)]);
  if(signal.aborted)return;
  const owned=offers.filter(j=>j.owner&&!j.cancelled&&Date.parse(j.departure)>Date.now());
  const vehicles=eligibility.vehicles.filter(v=>v.status==='approved');
  const templatesHTML=templates.map(t=>'<article class="passenger-row"><b>'+esc(t.stops[0].name)+' → '+esc(t.stops.at(-1).name)+'</b><small>'+esc(t.local_time)+' IST · '+esc(t.weekdays.map(d=>weekdays[d]).join(', '))+' · until '+esc(t.ends_on)+'</small><button class="btn secondary compact" data-generate="'+esc(t.id)+'">Create next 14 days</button><form data-skip="'+esc(t.id)+'"><label class="field">Skip a date<input type="date" name="date" min="'+(t.starts_on>today()?esc(t.starts_on):today())+'" max="'+esc(t.ends_on)+'" required></label><button class="btn secondary compact" type="submit" '+(t.ends_on<today()?'disabled':'')+'>Skip date</button></form></article>').join('');
  root.innerHTML=head('Driver / Weekly planning','Recurring rides','Set your weekly schedule once; each occurrence uses normal journey seat inventory and booking approval.')+
    '<div class="details-grid"><section class="panel"><div class="panel-cap">Your templates</div>'+(templatesHTML||'<p>No recurring templates yet.</p>')+'</section>'+
    '<form class="panel" data-create><div class="panel-cap">New recurring schedule</div>'+
    '<label class="field">Existing published route<select name="journey" required>'+owned.map(j=>'<option value="'+esc(j.id)+'">'+esc(j.stops[0].name)+' → '+esc(j.stops.at(-1).name)+'</option>').join('')+'</select></label>'+
    '<label class="field">Daily departure in IST<input type="time" name="time" value="'+(owned.length?esc(localTime(owned[0].departure)):'')+'" required></label>'+
    '<div class="field">Travel days</div><div class="checkline">'+weekdays.map((d,i)=>'<label><input type="checkbox" name="day" value="'+i+'" '+(i<5?'checked':'')+'> '+d+'</label>').join(' ')+'</div>'+
    '<div class="form-grid"><label class="field">Start<input type="date" name="start" min="'+today()+'" value="'+today(1)+'" required></label><label class="field">End<input type="date" name="end" value="'+today(30)+'" required></label></div>'+
    '<label class="field">Approved vehicle<select name="vehicle" required></select></label><p class="fine" data-capacity-note hidden></p>'+
    '<label class="field">Visibility<select name="circle"><option value="">Public</option>'+circles.filter(c=>c.role==='owner').map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name)+' (members only)</option>').join('')+'</select></label>'+
    '<p class="fine">A verified driver and an approved vehicle are required for recurring approval-mode journeys.</p>'+
    '<button class="btn primary" type="submit" '+(!owned.length||!vehicles.length||eligibility.driver_status!=='approved'?'disabled':'')+'>Save recurring template</button>'+
    (!owned.length?'<p><a href="#/offer">Publish a route to use for your schedule</a></p>':'')+
    (!vehicles.length||eligibility.driver_status!=='approved'?'<p><a href="#/verification">Complete verification first →</a></p>':'')+'</form></div><div data-notice role="status" hidden></div>';
  const form=root.querySelector('[data-create]');
  function selectRoute() {
    const route=owned.find(j=>j.id===form.elements.journey.value);
    if(!route)return;
    form.elements.time.value=localTime(route.departure);
    if(route.circle_id && ![...form.elements.circle.options].some(o=>o.value===route.circle_id)) {
      form.elements.circle.add(new Option('Same private circle as this route',route.circle_id));
    }
    form.elements.circle.value=route.circle_id || '';
    const eligible=vehicles.filter(v=>v.seat_capacity>=route.capacity);
    const vehicle=form.elements.vehicle;
    const previous=vehicle.value;
    vehicle.replaceChildren(...eligible.map(v=>new Option(v.make+' '+v.model,v.id)));
    const preferred=eligible.find(v=>v.id===route.vehicle_id)||eligible.find(v=>v.id===previous);
    if(preferred)vehicle.value=preferred.id;
    const note=form.querySelector('[data-capacity-note]');
    note.hidden=eligible.length>0;
    note.textContent='This route needs an approved vehicle with at least '+route.capacity+' passenger seats.';
    form.querySelector('[type=submit]').disabled=!eligible.length||eligibility.driver_status!=='approved';
  }
  function limitDates() {
    const start=form.elements.start.value;
    form.elements.end.min=start||today();
    if(!start){form.elements.end.removeAttribute('max');return;}
    const last=new Date(start+'T00:00:00Z');
    last.setUTCDate(last.getUTCDate()+89);
    form.elements.end.max=last.toISOString().slice(0,10);
  }
  form.elements.start.onchange=limitDates;
  limitDates();
  form.elements.journey.onchange=selectRoute;
  selectRoute();
  if(ctx.state.recurringNotice){
    notice(root,ctx.state.recurringNotice,'info');
    delete ctx.state.recurringNotice;
  }
  const templateId=requestId();
  form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{
    const offer=owned.find(j=>j.id===form.elements.journey.value);
    if(!offer)throw Error('Select an existing published route.');
    const days=[...form.querySelectorAll('[name=day]:checked')].map(el=>Number(el.value));
    if(!days.length)throw Error('Choose at least one day.');
    const created=await api.saveRecurring({
      template_id:templateId,stops:offer.stops,local_time:form.elements.time.value+':00',timezone:'Asia/Kolkata',
      weekdays:days,starts_on:form.elements.start.value,ends_on:form.elements.end.value,
      price_paise:offer.price_paise,capacity:offer.capacity,vehicle_id:form.elements.vehicle.value,
      booking_mode:'approval',...(form.elements.circle.value?{circle_id:form.elements.circle.value}:{})
    });
    try {
      await api.materializeRecurring(created.id);
    } catch(error) {
      ctx.state.recurringNotice='Template saved. Use “Create next 14 days” to retry scheduling. '+error.message;
    }
    if(!signal.aborted)ctx.render();
  },m=>notice(root,m,'error'));};
  root.querySelectorAll('[data-generate]').forEach(b=>b.onclick=()=>pending(b,async()=>{const result=await api.materializeRecurring(b.dataset.generate);notice(root,result.count+' upcoming journeys created.','info');},m=>notice(root,m,'error')));
  root.querySelectorAll('[data-skip]').forEach(f=>f.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{await api.skipRecurring(f.dataset.skip,f.elements.date.value,'Driver not travelling');notice(root,'Date skipped.','info');},m=>notice(root,m,'error'));});
}
