import {icon} from '../ui.js';

export function createMessageAlerts(api, {interval=8000}={}) {
  const control = new AbortController();
  const badge = document.createElement('span');
  badge.className='inbox-badge'; badge.id='inbox-unread'; badge.hidden=true;
  const nav=document.querySelector('[data-nav="messages"]');
  nav?.append(badge); nav?.setAttribute('aria-describedby',badge.id);
  const region=document.createElement('aside');
  region.className='message-alerts'; region.setAttribute('aria-label','New message alerts');
  document.body.append(region);
  let ready=false, watermark=0, seen=new Set(), busy=false, queued=false;
  function toast(row) {
    const path=`#/chat/${row.journey_id}/${row.ticket_id}`;
    if(location.hash.split('?')[0]===path || region.querySelector(`[data-ticket="${row.ticket_id}"]`))return;
    const item=document.createElement('div'); item.className='message-toast'; item.dataset.ticket=row.ticket_id;
    const link=document.createElement('a');link.href=path;
    link.innerHTML=icon('message',22)+'<span><b>New booking message</b><small>Open your private chat to reply</small></span>';
    const dismiss=document.createElement('button');dismiss.type='button';dismiss.setAttribute('aria-label','Dismiss message notification');dismiss.textContent='×';
    dismiss.onclick=()=>item.remove();link.onclick=()=>item.remove();item.append(link,dismiss);
    region.prepend(item);while(region.children.length>2)region.lastChild.remove();
    document.querySelector('#announcement').textContent='New booking message. Open Inbox to reply.';
    // Keep the action available while keyboard focus is inside the notification.
    const timer=setTimeout(()=>{if(!item.contains(document.activeElement))item.remove();},12000);
    control.signal.addEventListener('abort',()=>clearTimeout(timer),{once:true});
  }
  async function refresh() {
    if(control.signal.aborted || document.hidden || !api)return;
    if(busy){queued=true;return;}
    busy=true;
    try {
      const data=await api.messageSummary(control.signal);
      if(control.signal.aborted)return;
      badge.hidden=!data.unread;badge.textContent=data.unread>99?'99+':String(data.unread);
      badge.setAttribute('aria-label',`${data.unread} unread messages`);
      for(const row of [...data.items].reverse()) {
        const time=Date.parse(row.created_at);
        if(ready && !seen.has(row.message_id) && time>=watermark)toast(row);
      }
      watermark=Math.max(watermark,...data.items.map(row=>Date.parse(row.created_at)));
      for(const row of data.items)seen.add(row.message_id);
      if(seen.size>200)seen=new Set(data.items.map(row=>row.message_id));
      ready=true;
      window.dispatchEvent(new CustomEvent('cc:unread',{detail:data.unread}));
    }catch { /* Keep the last known badge; foreground navigation owns error messages. */ }
    finally {busy=false;if(queued){queued=false;void refresh();}}
  }
  window.addEventListener('cc:messages-read',refresh,{signal:control.signal});
  window.addEventListener('focus',refresh,{signal:control.signal});
  document.addEventListener('visibilitychange',refresh,{signal:control.signal});
  navigator.serviceWorker?.addEventListener('message',event=>{
    if(event.data?.type==='cc:message'){
      if(event.data.notified)seen.add(event.data.message_id);
      void refresh();
    }
  },{signal:control.signal});
  const timer=setInterval(refresh,interval);void refresh();
  return {refresh, stop(){control.abort();clearInterval(timer);region.remove();badge.remove();nav?.removeAttribute('aria-describedby');}};
}
