import {icon, esc, notice, pending} from '../ui.js';

export function contactsMarkup(){
  return `<section class="panel trusted-contacts"><div class="panel-cap">${icon('shield')} Favourite contacts</div>
    <p>Save up to five trusted people for trip sharing. These details are private to your account and never shown to drivers or passengers.</p>
    <div data-contact-list></div><form data-contact-form class="form-grid">
    <label class="field">Favourite slot<select name="slot">${[1,2,3,4,5].map(n=>`<option>${n}</option>`).join('')}</select></label>
    <label class="field">Contact name<input name="name" required maxlength="60" placeholder="E.g. Mum"></label>
    <label class="field">Share using<select name="channel"><option value="share">Device share menu</option><option value="sms">Text message</option><option value="email">Email</option></select></label>
    <label class="field">Phone with country code or email<input name="destination" maxlength="160" disabled placeholder="Not needed for device share menu"></label>
    <button class="btn secondary" type="submit">Save favourite</button></form>
    <p class="fine">Sharing opens your device’s composer or share menu; you choose when to send. Removing a favourite does not revoke a link already sent. Use Stop sharing to end access.</p>
    <div data-notice role="status" hidden></div></section>`;
}
export async function bindContacts(node,api,signal){
  const form=node.querySelector('form'),destination=form.elements.destination;
  form.elements.channel.onchange=()=>{destination.disabled=form.elements.channel.value==='share';destination.required=!destination.disabled;if(destination.disabled)destination.value='';destination.placeholder=destination.disabled?'Not needed for device share menu':form.elements.channel.value==='sms'?'+91…':'name@example.com';};
  async function refresh(){
    const contacts=await api.contacts(signal);if(signal.aborted)return;
    const list=node.querySelector('[data-contact-list]');list.replaceChildren();
    if(!contacts.length)list.textContent='No favourites saved yet.';
    for(const c of contacts){
      const row=document.createElement('div');row.className='contact-row';
      row.innerHTML=`<span><b>${esc(c.name)}</b><small>Slot ${c.slot} · ${esc(c.channel==='share'?'Device share menu':c.destination)}</small></span><button type="button" class="text-btn">Remove</button>`;
      row.querySelector('button').onclick=e=>pending(e.currentTarget,async()=>{await api.deleteContact(c.slot);await refresh();},m=>notice(node,m,'error'));list.append(row);
    }
    const free=[1,2,3,4,5].find(n=>!contacts.some(c=>c.slot===n));if(free)form.elements.slot.value=free;
  }
  form.onsubmit=e=>{e.preventDefault();pending(e.submitter,async()=>{
    await api.saveContact(Number(form.elements.slot.value),{name:form.elements.name.value,channel:form.elements.channel.value,destination:destination.value});
    notice(node,'Favourite saved.');form.elements.name.value='';destination.value='';await refresh();
  },m=>notice(node,m,'error'));};
  try{await refresh();}catch(e){if(!signal.aborted)notice(node,e.message,'error');}
}
