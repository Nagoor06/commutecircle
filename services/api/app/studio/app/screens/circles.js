import {access} from '../components/access.js';
import {head,esc,notice,pending} from '../ui.js';

export async function mount(ctx){
  const {root,api,auth,signal}=ctx;
  if(!api||!auth.signed)return access(ctx,'My circles','Sign in to manage private commute groups.');
  root.innerHTML='<p class="loading">Loading circles…</p>';
  const circles=await api.circles(signal);
  if(signal.aborted)return;
  const cards=circles.map(c=>'<article class="passenger-row"><b>'+esc(c.name)+'</b><small>'+esc(c.role)+' · Private</small><button class="btn secondary compact" data-browse="'+esc(c.id)+'">Browse journeys</button>'+(c.role==='owner'?'<button class="btn secondary compact" data-invite="'+esc(c.id)+'">Create invitation</button>':'')+'</article>').join('');
  root.innerHTML=head('Community / Private','My Circles','Coordinate trusted commute groups. Membership does not grant access to live location.')+
   '<div class="details-grid"><div class="stack"><section class="panel"><div class="panel-cap">My private circles</div>'+(cards||'<p>No circles yet.</p>')+'</section>'+
   '<form class="panel" data-create><div class="panel-cap">New circle</div><label class="field">Circle name<input name="name" minlength="3" maxlength="80" required></label><button class="btn primary" type="submit">Create circle</button></form></div>'+
   '<aside class="stack"><form class="panel" data-join><div class="panel-cap">Join with one-time token</div><label class="field">Invitation token<input name="token" minlength="32" maxlength="256" autocomplete="off" required></label><button class="btn secondary" type="submit">Join circle</button></form>'+
   '<section class="panel"><div class="panel-cap">Privacy</div><p>Circle-only rides are restricted to members. Invitations expire and can be used once.</p><a href="#/recurring">Recurring rides →</a></section></aside></div>'+
   '<section class="panel" data-token-panel hidden><p>Copy this one-time invitation and share it privately. It will not be shown again.</p><code data-token></code> <button data-copy class="btn secondary">Copy token</button></section>'+
   '<section class="panel" data-journeys hidden></section><div data-notice role="status" hidden></div>';
  const create=root.querySelector('[data-create]');
  create.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{await api.createCircle(create.elements.name.value.trim());if(!signal.aborted)ctx.render();},m=>notice(root,m,'error'));};
  const join=root.querySelector('[data-join]');
  join.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{await api.joinCircle(join.elements.token.value.trim());join.elements.token.value='';if(!signal.aborted)ctx.render();},m=>notice(root,m,'error'));};
  root.querySelectorAll('[data-browse]').forEach(b=>b.onclick=()=>pending(b,async()=>{
    const rows=await api.circleJourneys(b.dataset.browse,signal);
    if(signal.aborted)return;
    const panel=root.querySelector('[data-journeys]');panel.hidden=false;
    panel.innerHTML='<h2>Upcoming circle journeys</h2>'+(rows.length?rows.map(r=>'<p><a href="#/ride/'+encodeURIComponent(r.journey.id)+'">'+esc(r.journey.stops[0].name)+' → '+esc(r.journey.stops.at(-1).name)+'</a></p>').join(''):'<p>No upcoming journeys in this circle.</p>');
  },m=>notice(root,m,'error')));
  root.querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>pending(b,async()=>{
    const result=await api.inviteCircle(b.dataset.invite);
    if(signal.aborted)return;
    const panel=root.querySelector('[data-token-panel]');panel.hidden=false;
    panel.querySelector('[data-token]').textContent=result.token;
    panel.querySelector('[data-copy]').onclick=()=>navigator.clipboard.writeText(result.token).then(()=>notice(root,'Token copied.','info')).catch(()=>notice(root,'Copy manually from the token above.','error'));
  },m=>notice(root,m,'error')));
}
