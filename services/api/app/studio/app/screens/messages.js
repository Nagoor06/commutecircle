import {access} from '../components/access.js';
import {head, icon, esc, day, clock, empty, notice} from '../ui.js';

function conversation(row) {
  const other = row.role==='driver' ? 'Passenger' : 'Driver';
  const sender = row.sender===row.role ? 'You' : other;
  return `<a class="conversation ${row.unread?'unread':''}" href="#/chat/${encodeURIComponent(row.journey_id)}/${encodeURIComponent(row.ticket_id)}">
    <span class="conversation-avatar">${icon(row.role==='driver'?'user':'car',23)}</span>
    <div class="conversation-copy"><div class="conversation-heading"><b>${esc(row.origin)} <span aria-hidden="true">→</span> ${esc(row.destination)}</b>
      ${row.unread?`<span class="unread-count" aria-label="${row.unread} unread messages">${row.unread}</span>`:''}</div>
    <p class="conversation-preview">${row.preview?esc(sender+': '+row.preview):'Your booking is confirmed. Start a conversation.'}</p>
    <div class="conversation-meta"><span>${other} · Booking ${esc(row.ticket_id.slice(0,8))}</span><span>${icon('calendar',13)} ${esc(day(row.pickup_at))} · ${esc(clock(row.pickup_at))}</span><span class="conversation-state">${row.closed?'Read only':'Chat open'}</span></div></div>
    ${icon('chevron',18)}</a>`;
}

export async function mount(ctx) {
  const {root,api,auth,signal,query} = ctx;
  if (!api || !auth.signed) return access(ctx,'Messages','Sign in to see your private conversations with drivers and passengers.');
  const unread = query.get('view')==='unread';
  root.innerHTML = head('Your circle / Conversations','Messages','All your booking conversations, in one place.') +
    `<section class="panel inbox"><div class="inbox-toolbar"><nav class="tabs" aria-label="Message filters"><a href="#/messages" ${!unread?'aria-current="page"':''}>All conversations</a><a href="#/messages?view=unread" ${unread?'aria-current="page"':''}>Unread</a></nav>
    <button type="button" class="btn secondary compact" data-refresh>${icon('refresh',16)} Refresh</button></div>
    <p class="inbox-note">${icon('shield',16)} Private to each confirmed booking. Your phone number stays private.</p>
    <div data-notice role="status" hidden></div><div data-threads aria-live="polite"><p class="loading">Opening your conversations…</p></div>
    <button data-more class="btn secondary wide" hidden>Load more conversations</button></section>`;
  const list=root.querySelector('[data-threads]'), more=root.querySelector('[data-more]'), refresh=root.querySelector('[data-refresh]');
  let offset=0, busy=false, generation=0;
  const known=new Set();
  async function load(reset=false) {
    if (busy || signal.aborted) return;
    busy=true;more.disabled=true;refresh.disabled=true;
    const current=++generation;
    try {
      const data=await api.conversations({offset:reset?0:offset,unread_only:unread},signal);
      if (signal.aborted || current!==generation) return;
      if(reset){offset=0;known.clear();list.replaceChildren();}
      if (!offset && !data.items.length) list.innerHTML=empty(unread?'You’re all caught up':'No conversations yet',unread?
        'New messages from your driver or passenger will appear here.':'Chat opens after a confirmed booking. You can also open it from My trips.',unread?'#/messages':'#/book',unread?'All conversations':'Find a ride');
      for(const row of data.items) if(!known.has(row.ticket_id)) {known.add(row.ticket_id);list.insertAdjacentHTML('beforeend',conversation(row));}
      offset+=data.items.length;more.hidden=!data.has_more || !data.items.length;notice(root,'');
    }catch(e){
      if(signal.aborted)return;
      if(!offset)list.innerHTML='';
      notice(root,e.message+' Use Refresh to retry.','error');
    }finally{busy=false;more.disabled=false;refresh.disabled=false;}
  }
  refresh.onclick=()=>load(true);more.onclick=()=>load();
  await load(true);
  if(signal.aborted)return;
  const timer=setInterval(()=>{if(!document.hidden && offset<=20)load(true);},15000);
  signal.addEventListener('abort',()=>{generation++;clearInterval(timer);},{once:true});
}
