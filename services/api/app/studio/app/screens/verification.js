import {access} from '../components/access.js';
import {head,esc,notice,pending} from '../ui.js';

export async function mount(ctx) {
  const {root,api,auth,signal} = ctx;
  if (!api || !auth.signed) return access(ctx,'Verification','Sign in to manage your commuter and driver profile.');
  root.innerHTML = '<p class="loading">Opening verification…</p>';
  const [profile,eligibility] = await Promise.all([api.profile(signal),api.driverEligibility(signal)]);
  if(signal.aborted)return;
  root.innerHTML = head('Account / Trust','Verification','A staff reviewer must independently verify driver and vehicle eligibility.') +
   '<div class="details-grid"><div class="stack">' +
   '<form class="panel" data-profile><div class="panel-cap">Public display name</div><label class="field">Name<input name="display_name" minlength="2" maxlength="80" required value="' + esc(profile.display_name||'') + '"></label><button class="btn primary" type="submit">Save name</button></form>' +
   '<form class="panel" data-driver><div class="panel-cap">Driver verification</div><p>Current status: <b>' + esc(eligibility.driver_status) + '</b></p><label class="field">Secure verification case reference<input name="evidence_reference" minlength="6" maxlength="128" required></label><p class="fine">Do not enter identity document numbers, home addresses or scanned documents. This reference must be issued by a separate secured review process; submission is not approval.</p><button class="btn secondary" type="submit" ' + (['approved','suspended'].includes(eligibility.driver_status)?'disabled':'') + '>Submit for review</button></form>' +
   '<form class="panel" data-vehicle><div class="panel-cap">Vehicle for review</div><div class="form-grid"><label class="field">Make<input name="make" maxlength="60" required></label><label class="field">Model<input name="model" maxlength="60" required></label><label class="field">Colour<input name="color" maxlength="40" required></label><label class="field">Registration<input name="registration" minlength="5" maxlength="24" required></label><label class="field">Passenger seats<input name="seat_capacity" type="number" min="1" max="8" value="3" required></label></div><button class="btn secondary" type="submit">Submit vehicle</button></form>' +
   '</div><aside class="panel"><div class="panel-cap">Registered vehicles</div>' +
   (eligibility.vehicles.length?eligibility.vehicles.map(v=>'<p><b>'+esc(v.make)+' '+esc(v.model)+'</b> · '+esc(v.color)+'<br><small>'+esc(v.status)+' · '+esc(v.registration)+'</small></p>').join(''):'<p>No registered vehicles.</p>') +
   '<a href="#/offer" class="btn secondary">Offer a ride</a></aside></div><div data-notice role="status" hidden></div>';
  function bind(selector,send) {
    const form=root.querySelector(selector);
    form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{
      const values=Object.fromEntries(new FormData(form));
      if(values.seat_capacity)values.seat_capacity=Number(values.seat_capacity);
      await send(values);
      if(!signal.aborted)ctx.render();
    },m=>notice(root,m,'error'));};
  }
  bind('[data-profile]',data=>api.saveProfile(data));
  bind('[data-driver]',data=>api.submitDriverVerification(data));
  bind('[data-vehicle]',data=>api.submitVehicle(data));
}
