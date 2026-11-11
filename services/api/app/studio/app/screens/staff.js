import {access} from '../components/access.js';
import {head,esc,notice,pending,confirmation} from '../ui.js';

export async function mount(ctx) {
  const {root,api,auth,signal} = ctx;
  if (!api || !auth.signed) {
    return access(ctx,'Staff review','Sign in with an authorized staff account.');
  }
  root.innerHTML='<p class="loading">Checking staff permissions…</p>';
  let drivers,vehicles,reports;
  try {
    [drivers,vehicles,reports]=await Promise.all([
      api.staffDrivers(signal),api.staffVehicles(signal),api.staffReports(signal)
    ]);
  } catch(error) {
    if(signal.aborted)return;
    if(error.status===403) {
      root.innerHTML=head('Trust / Restricted','Staff access required',
        'Verification and incident records are only visible to authorized reviewers.')+
        '<p class="fine">Ask a system administrator to authorize the required staff scope. '+
        'No account can approve its own verification.</p>' +
        '<button class="btn secondary" data-staff-signin>Sign in with a reviewer account</button>';
      root.querySelector('[data-staff-signin]').onclick = () => auth.begin('staff');
      return;
    }
    throw error;
  }
  if(signal.aborted)return;
  const driverHtml=drivers.map(d=>
    '<article class="passenger-row"><b>Driver application</b><small>'+
    esc(d.subject)+' · '+esc(d.status)+'</small><p>Case reference: '+
    esc(d.evidence_reference||'Not supplied')+'</p>'+
    '<div class="button-row"><button class="btn secondary compact" data-driver="'+
    esc(d.subject)+'" data-decision="approved">Approve</button>'+
    '<button class="btn secondary compact" data-driver="'+
    esc(d.subject)+'" data-decision="rejected">Reject</button></div></article>'
  ).join('');
  const vehiclesHtml=vehicles.map(v=>
    '<article class="passenger-row"><b>'+esc(v.make)+' '+esc(v.model)+'</b><small>'+
    esc(v.subject)+' · '+esc(v.color)+' · '+esc(v.registration)+'</small>'+
    '<div class="button-row"><button class="btn secondary compact" data-vehicle="'+
    esc(v.id)+'" data-decision="approved">Approve</button>'+
    '<button class="btn secondary compact" data-vehicle="'+
    esc(v.id)+'" data-decision="rejected">Reject</button></div></article>'
  ).join('');
  const reportsHtml=reports.map(r=>
    '<article class="passenger-row"><b>'+esc(r.category.replaceAll('_',' '))+'</b>'+
    '<small>'+esc(r.state)+' · '+esc(r.created_at)+'</small><p>'+esc(r.description)+'</p>'+
    '<form data-case="'+esc(r.id)+'"><label class="field">Case status<select name="state">'+
    '<option value="reviewing">Reviewing</option><option value="resolved">Resolved</option>'+
    '<option value="closed">Closed</option></select></label>'+
    '<label class="field">Internal case note<textarea name="note" minlength="5" maxlength="1000" required></textarea></label>'+
    '<button class="btn secondary compact" type="submit">Record review</button></form></article>'
  ).join('');
  root.innerHTML=head('Restricted / Trust operations','Trust & safety review',
    'Review identity and vehicle evidence independently. This dashboard is not an emergency dispatch service.')+
    '<div class="stack"><section class="panel"><div class="panel-cap">Pending driver applications ('+drivers.length+')</div>'+
    (driverHtml||'<p>No pending driver applications.</p>')+'</section>'+
    '<section class="panel"><div class="panel-cap">Pending vehicle reviews ('+vehicles.length+')</div>'+
    (vehiclesHtml||'<p>No pending vehicle registrations.</p>')+'</section>'+
    '<section class="panel"><div class="panel-cap">Safety case queue ('+reports.length+')</div>'+
    (reportsHtml||'<p>No open safety reports.</p>')+'</section></div>'+
    '<div data-notice role="status" hidden></div>';
  root.querySelectorAll('[data-driver]').forEach(button=>button.onclick=()=>pending(button,async()=>{
    if(!await confirmation('Confirm verification decision?',
      'Only approve once all required evidence has been independently checked.','Confirm decision'))return;
    await api.staffDriverDecision(button.dataset.driver,button.dataset.decision);
    if(!signal.aborted)ctx.render();
  },error=>notice(root,error,'error')));
  root.querySelectorAll('[data-vehicle]').forEach(button=>button.onclick=()=>pending(button,async()=>{
    if(!await confirmation('Confirm vehicle verification?',
      'Check registration, eligibility and the vehicle against your verification procedure.','Confirm decision'))return;
    await api.staffVehicleDecision(button.dataset.vehicle,button.dataset.decision);
    if(!signal.aborted)ctx.render();
  },error=>notice(root,error,'error')));
  root.querySelectorAll('[data-case]').forEach(form=>form.onsubmit=event=>{
    event.preventDefault();
    pending(event.submitter,async()=>{
      await api.staffReviewCase(form.dataset.case,{
        state:form.elements.state.value,note:form.elements.note.value.trim()
      });
      if(!signal.aborted)ctx.render();
    },error=>notice(root,error,'error'));
  });
}
