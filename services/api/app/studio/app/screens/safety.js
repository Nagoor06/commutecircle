import {access} from '../components/access.js';
import {head,esc,notice,pending} from '../ui.js';

export async function mount(ctx){
  const {root,api,auth,signal,query}=ctx;
  if(!api||!auth.signed)return access(ctx,'Safety reports','Sign in to report a problem on a ride you joined or offered.');
  root.innerHTML='<p class="loading">Loading confidential reports…</p>';
  const [trips,reports]=await Promise.all([api.allMine(signal),api.safetyReports(signal)]);
  if(signal.aborted)return;
  const selected = query.get('journey');
  if (selected && !trips.some(j=>j.id===selected)) throw Error('This journey is unavailable for your account.');
  const routes=trips.map(j=>'<option value="'+esc(j.id)+'" '+(query.get('journey')===j.id?'selected':'')+'>'+esc(j.stops[0].name)+' → '+esc(j.stops.at(-1).name)+' · '+esc(j.departure.slice(0,10))+'</option>').join('');
  const history=reports.map(r=>'<article class="passenger-row"><b>'+esc(r.category.replaceAll('_',' '))+'</b><small>'+esc(r.state)+' · '+esc(r.created_at.slice(0,10))+'</small><p>'+esc(r.description)+'</p></article>').join('');
  root.innerHTML=head('Safety / Report','Safety reports','For immediate danger, call local emergency services. This form is not an emergency response service.')+
    '<div class="details-grid"><form class="panel" data-report><div class="panel-cap">Report a concern</div>'+
    '<label class="field">Journey<select name="journey_id" required>'+routes+'</select></label>'+
    '<label class="field">Problem type<select name="category"><option value="unsafe_driving">Unsafe driving</option><option value="vehicle_mismatch">Vehicle mismatch</option><option value="harassment">Harassment</option><option value="pickup_issue">Pickup concern</option><option value="other">Other</option></select></label>'+
    '<label class="field">What happened?<textarea name="description" minlength="10" maxlength="1500" rows="5" required></textarea></label>'+
    '<p class="fine">Reports are only visible to their authors and authorized reviewers, not all members of your circle. Submitting a report does not summon help.</p>'+
    '<button class="btn primary" type="submit" '+(!trips.length?'disabled':'')+'>Submit confidential report</button></form>'+
    '<aside class="panel"><div class="panel-cap">Your reports</div>'+(history||'<p>No reports submitted.</p>')+'</aside></div><div data-notice role="status" hidden></div>';
  const form=root.querySelector('[data-report]');
  form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{await api.submitSafetyReport(Object.fromEntries(new FormData(form)));if(!signal.aborted)ctx.render();},m=>notice(root,m,'error'));};
}
