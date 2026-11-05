import {access} from '../components/access.js';
import {head,back,icon,esc,notice,pending,clock} from '../ui.js';

export async function mount(ctx){
  const {root,api,auth,state,parts,query,signal}=ctx;
  if(!api||!auth.signed)return access(ctx,'Share my trip','Sign in to share a trip with trusted contacts.');
  const jid=parts[0],tid=query.get('ticket');
  root.innerHTML='<p class="loading">Opening trip sharing…</p>';
  const journey=await api.detail(jid,signal);if(signal.aborted)return;
  const ticket=journey.tickets.find(t=>t.id===tid&&t.state==='paid');
  if(!journey.owner&&!ticket)throw Error('Only the traveller can share this confirmed trip.');
  const first=journey.owner?0:ticket.board,last=journey.owner?journey.stops.length-1:ticket.alight;
  root.innerHTML=back('#/trips','My trips')+head('Safety / Trusted contacts','Share my trip','Let someone you trust follow your journey, without joining CommuteCircle.')+
    `<section class="panel sharing-panel"><div class="panel-cap">${icon('shield')} Your choice, your location</div><h2>${esc(journey.stops[first].name)} → ${esc(journey.stops[last].name)}</h2>
    <p>Anyone with your link can see your latest location until it expires or you stop sharing. Send it only to people you trust. Your phone, employer and saved contacts are not included.</p>
    <label class="checkline"><input data-consent type="checkbox"> I want to share my live GPS location with people who receive my link.</label>
    ${journey.owner?'<label class="checkline"><input data-passengers type="checkbox"> Also let my confirmed passengers track the vehicle during their booked trip.</label>':''}
    <p class="fine">Viewers can open a live map. Its map provider receives the area they view, never your private link or saved contacts. Start sharing from a public meeting point, before driving. Keep passenger sharing off while at home: live GPS reveals your precise position.</p>
    <div class="button-row"><button data-start class="btn primary">Start location sharing</button><button data-stop class="btn quiet-danger" hidden>Stop sharing</button></div>
    <p data-state class="share-state" role="status">Sharing is off.</p><div data-link hidden><label class="field">Private trip link<input readonly data-url></label><button data-copy class="btn secondary">Copy link</button><div data-contacts class="quick-replies"></div></div>
    <div data-notice role="status" hidden></div><p class="fine">Available from one hour before pickup. Links last at most four hours and end after five minutes without updates. Keep this page open: phone browsers may pause location in the background. This feature does not contact emergency services.</p><a href="#/profile" class="text-btn">Manage favourite contacts</a></section>`;
  let contacts=[];
  try{contacts=await api.contacts(signal);}catch(e){notice(root,'Favourites could not load. You can still copy your link.','info');}
  if(signal.aborted)return;
  const sharing=state.sharing,linkInput=root.querySelector('[data-url]');
  function display(current){
    const active=current?.journey_id===jid&&(journey.owner?!current.ticket_id:current.ticket_id===tid);
    root.querySelector('[data-start]').hidden=active;root.querySelector('[data-stop]').hidden=!active;
    root.querySelector('[data-link]').hidden=!active;
    root.querySelector('[data-consent]').disabled=active;
    const passengers=root.querySelector('[data-passengers]');
    if(passengers){passengers.disabled=active;if(active)passengers.checked=current.passengers_allowed;}
    root.querySelector('[data-state]').textContent=active?current.status+(current.updated_at?' · updated '+clock(current.updated_at):'')+' · expires '+clock(current.expires_at):'Sharing is off.';
    if(active)linkInput.value=new URL('./',location.href).href+'#/track/'+current.token;
    else linkInput.value='';
  }
  const unsubscribe=sharing.subscribe(display);signal.addEventListener('abort',unsubscribe,{once:true});
  root.querySelector('[data-start]').onclick=e=>pending(e.currentTarget,async()=>{
    if(!root.querySelector('[data-consent]').checked)throw Error('Confirm who can see your location before starting.');
    await sharing.start(jid,journey.owner?null:tid,!!root.querySelector('[data-passengers]')?.checked);
  },m=>notice(root,m,'error'));
  root.querySelector('[data-stop]').onclick=e=>pending(e.currentTarget,()=>sharing.stop(),m=>notice(root,m,'error'));
  root.querySelector('[data-copy]').onclick=async()=>{try{await navigator.clipboard.writeText(linkInput.value);notice(root,'Link copied. Share it only with trusted people.');}catch{linkInput.focus();linkInput.select();notice(root,'Select and copy the link above.');}};
  for(const contact of contacts){
    const button=document.createElement('button');button.textContent='Share with '+contact.name;
    button.onclick=async()=>{
      const url=linkInput.value;if(!url)return;
      const text='Follow my CommuteCircle trip. This private location link expires automatically: '+url;
      if(contact.channel==='sms')location.href='sms:'+contact.destination+'?body='+encodeURIComponent(text);
      else if(contact.channel==='email')location.href='mailto:'+encodeURIComponent(contact.destination)+'?subject=My%20CommuteCircle%20trip&body='+encodeURIComponent(text);
      else if(navigator.share){try{await navigator.share({title:'My CommuteCircle trip',text:'Follow my trip with this private link.',url});}catch(e){if(e.name!=='AbortError')notice(root,'Sharing is unavailable. Copy the link instead.');}}
      else notice(root,'Use Copy link, then send it to '+contact.name+' in your usual messaging app.');
    };
    root.querySelector('[data-contacts]').append(button);
  }
}
