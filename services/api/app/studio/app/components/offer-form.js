import {esc,head,back,icon,day,clock,money,dateInput} from '../ui.js';
import {fieldMarkup} from './place-field.js';

function options(values,selected){
  return values.map(value=>'<option value="'+esc(value)+'"'+(value==selected?' selected':'')+'>'+esc(value)+'</option>').join('');
}
function vehicleFields(car){
  return [['make','Make','Honda',60],['model','Model','City',60],['color','Colour','White',40]].map(([key,label,example,limit])=>
    '<label class="field">'+label+'<input name="'+key+'" maxlength="'+limit+'" placeholder="'+example+'" value="'+esc(car[key])+'"></label>').join('');
}
export function offerForm(d, approvals = true){
  const seatOptions=options([1,2,3,4,5,6,7,8],d.seats);
  const conditions=options(['excellent','good','fair'],d.car.condition);
  return head('Driver / Create an offer','Offer a ride','Set your stops, departure time and price per seat.')+
    `<form data-offer-form><div class="offer-layout"><div class="stack">
    <section class="panel"><div class="panel-cap"><span class="step-no">01</span> Your route</div>
      <p class="panel-intro">Choose public stops in travel order. Calculate road distances and estimated times, then review them before publishing.</p>
      <button type="button" data-calculate class="btn secondary">${icon('route')} Calculate route & timings</button>
      <label class="checkline"><input type="checkbox" name="addPublic" ${d.addPublic?'checked':''}> Add nearby public stops along a two-stop route</label>
      <p class="fine">Uses the selected stops with OSRM routing. Added stops change the route. Review every meeting point and allow for traffic.</p>
      <div data-stops></div><button type="button" data-add-stop class="text-btn">${icon('plus',16)} Add an intermediate stop</button></section>
    <section class="panel"><div class="panel-cap"><span class="step-no">02</span> Departure & fare</div>
      <div class="form-grid"><label class="field span-2">Departure · local time<input type="datetime-local" name="time" required value="${esc(d.time)}"></label>
        <label class="field">Full-route fare per seat (₹)<input type="number" min="1" max="100000" step=".01" name="price" required placeholder="200" value="${esc(d.price)}"></label>
        <label class="field">Seats offered<select name="seats">${seatOptions}</select></label></div></section>
    ${approvals?`<section class="panel"><div class="panel-cap">Booking policy</div>
      <label class="field">Booking mode<select name="bookingMode"><option value="instant" ${d.bookingMode!=='approval'?'selected':''}>Instant sandbox checkout</option><option value="approval" ${d.bookingMode==='approval'?'selected':''}>Driver-approved requests</option></select></label>
      <label class="field">Approved vehicle<select name="vehicleId"><option value="">Select a verified vehicle</option>${(d.v2Vehicles||[]).map(v=>'<option value="'+esc(v.id)+'" '+(d.vehicleId===v.id?'selected':'')+'>'+esc(v.make+' '+v.model)+'</option>').join('')}</select></label>
      <label class="field">Audience<select name="circleId"><option value="">Public</option>${(d.v2Circles||[]).filter(c=>c.role==='owner').map(c=>'<option value="'+esc(c.id)+'" '+(d.circleId===c.id?'selected':'')+'>'+esc(c.name)+' (private)</option>').join('')}</select></label>
      <p class="fine">${d.requireVehicle?'All offers require a verified driver and an approved vehicle.':'Driver-approved rides require a verified driver and an approved vehicle.'} Private circle rides require approval. <a href="#/verification">Manage verification</a>.</p></section>`:'<p class="fine">This service currently supports public instant rides.</p>'}
    <section class="panel"><div class="panel-cap">Ride preferences</div><label class="checkline"><input type="checkbox" name="quiet" ${d.quiet?'checked':''}> ${icon('quiet',18)} <span>Quiet ride · keep calls brief</span></label><label class="checkline"><input type="checkbox" name="air_conditioned" ${d.air_conditioned?'checked':''}> ${icon('snowflake',18)} <span>Air conditioning available</span></label></section>
    <section class="panel"><div class="panel-cap"><span class="step-no">03</span> Vehicle details</div>
      <label class="checkline"><input type="checkbox" name="withCar" ${d.withCar?'checked':''}> Include my vehicle on this offer</label>
      <div data-car class="form-grid" ${d.withCar?'':'hidden'}>${vehicleFields(d.car)}
        <label class="field">Date purchased<input type="date" name="purchased_on" min="1886-01-01" max="${dateInput()}" value="${esc(d.car.purchased_on)}"></label>
        <label class="field">Driver-reported condition<select name="condition">${conditions}</select></label></div></section></div>
    <aside class="panel summary-note"><div class="section-index"><span class="index-dot"></span> Offer summary</div>
      <h2 data-summary></h2><p>Passengers can reserve the legs they travel. The remaining legs stay available.</p>
      <div class="note-box">${icon('info')}<span>Passengers see your ride after publication. Payments currently use sandbox money.</span></div>
      <label class="checkline"><input type="checkbox" required> I have checked the public stops and estimated route timings.</label>
      <button class="btn primary wide" type="submit">Review ride ${icon('arrow')}</button><div data-notice role="status" hidden></div>
    </aside></div></form>`;
}
export function stopRow(s,i,n){
  const start=i===0, end=i===n-1;
  const remove=start||end?'':'<button type="button" class="icon-only" aria-label="Remove stop '+(i+1)+'" data-remove="'+i+'">'+icon('close',16)+'</button>';
  const field=fieldMarkup('offer-'+i,s,{label:'Meeting place',badge:i===0?'A':end?'B':String(i+1)});
  return `<div class="offer-stop" data-row="${i}"><div class="stop-heading"><b>${start?'Pickup':end?'Final drop-off':'Intermediate stop'}</b>${remove}</div>
    <div class="stop-fields">${field}
      <label class="field">km from start<input data-value="km" type="number" min="0" max="3000" step=".001" required ${start?'readonly':''} value="${esc(s.km)}"></label>
      <label class="field">min from start<input data-value="minutes" type="number" min="0" max="2880" step="1" required ${start?'readonly':''} value="${esc(s.minutes)}"></label>
    </div></div>`;
}
export function offerReview(offer,button){
  const timeline=offer.stops.map((p,i)=>`<li><span class="stop-time">${esc(clock(Date.parse(offer.departure)+p.minutes*60000))}</span>
    <i class="${i===offer.stops.length-1?'last':''}"></i><div><b>${esc(p.name)}</b><small>${p.metres/1000} km from start</small></div></li>`).join('');
  const car=offer.vehicle?offer.vehicle.make+' '+offer.vehicle.model:offer.vehicle_id?'Approved vehicle selected':'Vehicle details not supplied';
  return back('#/offer','Edit offer')+head('Driver / Review','Review your ride','Check the route and fare passengers will see.')+
    `<div class="details-grid"><section class="panel"><div class="panel-cap">${icon('route')} Route and timing</div><ol class="stop-list">${timeline}</ol></section>
    <section class="panel"><div class="panel-cap">${icon('car')} Your offer</div>
    <div class="fare-line"><span>Full fare per seat</span><b>${money(offer.price_paise)}</b></div>
    <p>${esc(day(offer.departure))} · ${offer.capacity} seat(s)</p><p class="muted">${esc(car)}</p>
    <p>Booking: ${offer.booking_mode==='approval'?'Driver approval':'Instant checkout'} · ${offer.circle_id?'Private circle':'Public ride'}</p>
    <button data-publish class="btn primary wide">${esc(button)} ${icon('arrow')}</button><div data-notice role="status" hidden></div></section></div>`;
}
