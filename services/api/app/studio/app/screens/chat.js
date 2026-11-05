import {access} from '../components/access.js';
import {head, back, notice, pending, confirmation, clock, day, icon} from '../ui.js';
import {requestId} from '../data/id.js';

export async function mount(ctx) {
  const {root, api, auth, parts, signal} = ctx;
  if (!api || !auth.signed) return access(ctx,'Booking chat','Sign in to open your private booking conversation.');
  const [jid,tid] = parts;
  root.innerHTML = back('#/messages','All messages') + head('Your booking / Private chat','Meet without sharing numbers','Only this passenger and driver can open this conversation.') +
    `<section class="panel chat-panel"><div class="chat-context"><span class="panel-cap">${icon('message')} Booking conversation</span><a class="text-btn" href="#/trips">My trips ${icon('arrow',15)}</a></div><p class="fine chat-privacy">Keep it about the journey. Phone numbers, emails, contact links and attachments are blocked. Filtering cannot detect every disguised contact detail. Messages are stored by CommuteCircle; this is not end-to-end encrypted.</p>
    <div data-messages class="messages" role="log" aria-label="Booking messages" aria-live="polite"></div>
    <div class="quick-replies"><button type="button">I’m at the pickup point.</button><button type="button">I’ll arrive in 5 minutes.</button><button type="button">Which side of the public entrance?</button></div>
    <form data-chat><label class="field">Message<textarea maxlength="500" rows="3" required placeholder="Describe a public landmark…"></textarea></label><button class="btn primary">Send message</button></form>
    <div data-notice role="status" hidden></div><div class="button-row"><button data-refresh class="text-btn">Refresh messages</button><button data-block class="text-btn cancel">Block this chat</button></div></section>`;
  let timer, busy=false, blocked=false, last='', acknowledged='', draftKey;
  const field=root.querySelector('textarea'), form=root.querySelector('form');
  async function refresh() {
    if (busy || signal.aborted) return;
    busy=true;
    try {
      const data=await api.messages(jid,tid,signal);
      if(signal.aborted)return;
      const serialized=JSON.stringify(data.messages);
      if(serialized!==last){
        last=serialized;
        const list=root.querySelector('[data-messages]');
        const atBottom=list.scrollHeight-list.scrollTop-list.clientHeight<80;
        list.replaceChildren();
        if(!data.messages.length) list.textContent='No messages yet. Use a quick reply to introduce yourself.';
        for(const m of data.messages){
          const bubble=document.createElement('article');bubble.className='message '+(m.sender===data.role?'mine':'');
          const label=document.createElement('small');label.textContent=(m.sender===data.role?'You':m.sender==='driver'?'Driver':'Passenger')+' · '+day(m.created_at)+' · '+clock(m.created_at);
          const body=document.createElement('p');body.textContent=m.text;bubble.append(label,body);list.append(bubble);
        }
        if(atBottom)list.scrollTop=list.scrollHeight;
      }
      const newest=data.messages.at(-1)?.id;
      const log=root.querySelector('[data-messages]');
      if(newest && newest!==acknowledged && !document.hidden && log.scrollHeight-log.scrollTop-log.clientHeight<80){
        await api.readMessages(jid,tid,newest,signal);acknowledged=newest;
      }
      blocked=data.closed;
      form.hidden=blocked;root.querySelector('.quick-replies').hidden=blocked;
      if(blocked) notice(root,'This conversation is closed. You can still read its messages.');
    } catch(e){if(!signal.aborted)notice(root,e.message+' Use Refresh messages to retry.','error');}
    finally{busy=false;}
  }
  form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{
    draftKey ||= requestId();
    await api.sendMessage(jid,tid,{message_id:draftKey,text:field.value.trim()});
    field.value='';draftKey=null;notice(root,'');await refresh();
  },m=>notice(root,m,'error'));};
  field.oninput=()=>{draftKey=null;};
  root.querySelectorAll('.quick-replies button').forEach(b=>b.onclick=()=>{field.value=b.textContent;draftKey=null;field.focus();});
  root.querySelector('[data-refresh]').onclick=refresh;
  root.querySelector('[data-block]').onclick=e=>pending(e.currentTarget,async()=>{
    if(await confirmation('Block this conversation?','Neither person can send further messages for this booking. This does not cancel the ride.','Block chat')){
      await api.blockChat(jid,tid);await refresh();
    }
  },m=>notice(root,m,'error'));
  await refresh();
  if(!signal.aborted)timer=setInterval(()=>{if(!document.hidden&&!blocked)refresh();},8000);
  signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
}
