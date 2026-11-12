import {access} from '../components/access.js';
import {head,esc,icon,notice,pending} from '../ui.js';

function showInvitation(panel, name, {token, expires_at, expires_in_seconds}) {
  const url = new URL(location.pathname, location.origin);
  url.hash = '/circles';
  const expires = expires_at ? Date.parse(expires_at) : Date.now() + Number(expires_in_seconds) * 1000;
  const expiry = Number.isFinite(expires)
    ? 'This token can be used once and expires on ' + new Date(expires).toLocaleString(undefined, {
      day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }) + '.'
    : 'This token can be used once.';
  panel.innerHTML = `
    <h3 class="panel-cap">${icon('users',20)} Circle invitation</h3>
    <div class="invitation-message" data-message>
      <p data-greeting></p>
      <p>Open My Circles at <a data-join-url></a></p>
      <p>Sign in and paste this token into “Join with one-time token”.</p>
      <code data-token></code>
      <p data-expiry></p>
    </div>
    <p class="fine">Copy the invitation before leaving this page and send it privately.</p>
    <div class="button-row">
      <button type="button" class="btn primary" data-copy-message>${icon('copy',16)} Copy invitation</button>
      <button type="button" class="btn secondary" data-copy-token>Copy token</button>
    </div>
    <p class="fine" role="status" data-copy-status></p>`;
  const message = panel.querySelector('[data-message]');
  message.querySelector('[data-greeting]').textContent = 'You’re invited to join ' + name + ' on CommuteCircle!';
  const link = message.querySelector('[data-join-url]');
  link.href = url.href;
  link.textContent = url.href;
  const code = message.querySelector('[data-token]');
  code.textContent = token;
  message.querySelector('[data-expiry]').textContent = expiry;
  const status = panel.querySelector('[data-copy-status]');
  async function copy(node, text, label) {
    try {
      await navigator.clipboard.writeText(text);
      status.textContent = label + ' copied.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      status.textContent = label + ' selected. Use your device’s Copy command.';
    }
  }
  const invitation = Array.from(message.children, el => el.textContent).join('\n\n');
  panel.querySelector('[data-copy-message]').onclick = () => copy(message, invitation, 'Invitation');
  panel.querySelector('[data-copy-token]').onclick = () => copy(code, token, 'Token');
  panel.hidden = false;
  panel.focus();
}

export async function mount(ctx){
  const {root,api,auth,signal}=ctx;
  if(!api||!auth.signed)return access(ctx,'My circles','Sign in to manage private commute groups.');
  root.innerHTML='<p class="loading">Loading circles…</p>';
  const circles=await api.circles(signal);
  if(signal.aborted)return;
  const cards=circles.map(c=>'<article class="passenger-row circle-row"><b>'+esc(c.name)+'</b><small>'+esc(c.role)+' · Private</small><div class="button-row"><button class="btn secondary compact" data-browse="'+esc(c.id)+'">Browse journeys</button>'+(c.role==='owner'?'<button class="btn secondary compact" data-invite="'+esc(c.id)+'">Create invitation</button>':'')+'</div>'+(c.role==='owner'?'<section class="circle-invitation" data-token-panel aria-label="Circle invitation" tabindex="-1" hidden></section>':'')+'</article>').join('');
  root.innerHTML=head('Community / Private','My Circles','Coordinate trusted commute groups. Membership does not grant access to live location.')+
   '<div class="details-grid circles-grid"><div class="stack"><section class="panel"><div class="panel-cap">'+icon('users',20)+' My private circles</div>'+(cards||'<p>No circles yet.</p>')+'</section>'+
   '<form class="panel" data-create><div class="panel-cap">New circle</div><label class="field">Circle name<input name="name" minlength="3" maxlength="80" required></label><button class="btn primary" type="submit">Create circle</button></form></div>'+
   '<aside class="stack"><form class="panel" data-join><div class="panel-cap">Join with one-time token</div><label class="field">Invitation token<input name="token" minlength="32" maxlength="256" autocomplete="off" required></label><button class="btn secondary" type="submit">Join circle</button></form>'+
   '<section class="panel"><div class="panel-cap">Privacy</div><p>Circle-only rides are restricted to members. Invitations expire and can be used once.</p><a href="#/recurring">Recurring rides →</a></section></aside></div>'+
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
    const row=b.closest('.circle-row');
    showInvitation(row.querySelector('[data-token-panel]'),row.querySelector('b').textContent,result);
  },m=>notice(root,m,'error')));
}
