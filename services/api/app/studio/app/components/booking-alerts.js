import {esc,icon,pending} from '../ui.js';

export function alertsMarkup() {
  return `<section class="panel booking-alerts"><div class="panel-cap">${icon('message')} Booking alerts</div><div data-alert-settings role="status">Loading your preferences…</div></section>`;
}

export async function bindAlerts(node, api, signal) {
  const host=node.querySelector('[data-alert-settings]');
  let prefs;
  const message = (text,error=false) => {
    const target=node.querySelector('[data-alert-notice]');
    target.textContent=text;target.className=error?'notice error':'notice info';target.hidden=!text;
  };
  const action = (button, task) => pending(button,task,e=>message(e,true));
  function paint() {
    host.removeAttribute('role');
    host.innerHTML=`<p>Get booking confirmations and cancellation updates by email, plus WhatsApp or SMS if you choose. Contact details stay private.</p>
      ${!prefs.available.email?'<p class="fine">Email delivery is awaiting service setup. You can save your preference for future bookings.</p>':''}
      <div class="alert-email">${prefs.email?`<p>Verified sign-in email<br><b>${esc(prefs.email)}</b></p>`:'<p>Use the verified email from your sign-in account. This enables booking emails.</p><button type="button" class="btn secondary" data-email>Enable email confirmations</button>'}</div>
      <form data-alert-options><label class="checkline"><input type="checkbox" name="email" ${prefs.email_enabled?'checked':''} ${prefs.email?'':'disabled'}><span>Email me booking updates</span></label>
      <label class="field">Phone updates <select name="channel" ${prefs.phone?'':'disabled'}><option value="none">No phone updates</option><option value="whatsapp" ${prefs.phone_channel==='whatsapp'?'selected':''}>WhatsApp</option><option value="sms" ${prefs.phone_channel==='sms'?'selected':''}>SMS</option></select></label>
      ${prefs.phone?`<p class="fine">Verified number: ${esc(prefs.phone)}</p>`:'<p class="fine">Verify your number below to choose phone updates.</p>'}
      ${!prefs.available.sms&&!prefs.available.whatsapp?'<p class="fine">WhatsApp and SMS delivery are awaiting service setup.</p>':''}
      <p class="fine">Saving opts you into the channels you select. Booking updates only; no marketing. You can turn them off here.</p>
      <button class="btn primary" type="submit">Save alert preferences</button></form>
      <details class="alert-phone"><summary>${prefs.phone?'Change verified number':'Add a phone number'}</summary>
      ${!prefs.available.verification?'<p>Phone verification is awaiting service setup. Your bookings and in-app receipts remain available.</p>':`<form data-phone><label class="field">Your mobile number<input type="tel" name="phone" autocomplete="tel" placeholder="+91…" pattern="\\+[1-9][0-9]{7,14}" maxlength="16" required></label><label class="checkline"><input name="consent" type="checkbox" required><span>Send me an SMS verification code at this number.</span></label><button type="submit" class="btn secondary">Send verification code</button></form><form data-code hidden><label class="field">Verification code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{4,10}" maxlength="10" required></label><button type="submit" class="btn secondary">Verify number</button></form>`}</details>
      <div data-alert-notice role="status" hidden></div>`;
    const email=node.querySelector('[data-email]');
    if(email)email.onclick=()=>action(email,async()=>{prefs=await api.connectAlertEmail();if(!signal.aborted){paint();message('Email preference saved for future bookings.');}});
    node.querySelector('[data-alert-options]').onsubmit=e=>{e.preventDefault();const form=e.currentTarget;action(e.submitter,async()=>{
      prefs=await api.saveAlerts({email_enabled:form.elements.email.checked,phone_channel:form.elements.channel.value});
      if(!signal.aborted){paint();message('Booking alert preferences saved.');}
    });};
    const phone=node.querySelector('[data-phone]');
    if(phone)phone.onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
      await api.requestPhoneCode({phone:phone.elements.phone.value.trim(),consent:true});
      if(signal.aborted)return;
      node.querySelector('[data-code]').hidden=false;
      message('Code requested. Enter it within 10 minutes.');
    });};
    const code=node.querySelector('[data-code]');
    if(code)code.onsubmit=e=>{e.preventDefault();action(e.submitter,async()=>{
      prefs=await api.verifyPhone({code:code.elements.code.value.trim()});
      if(!signal.aborted){paint();message('Number verified. Choose WhatsApp or SMS, then save your preferences.');}
    });};
  }
  try {prefs=await api.alerts(signal);if(!signal.aborted)paint();}
  catch {if(!signal.aborted)host.textContent='Could not load booking alert preferences. Reopen My profile to retry.';}
}

const events={paid:'Confirmation',driver_cancelled:'Driver cancellation',rider_cancelled:'Cancellation',exited:'Segment completion'};
const states={queued:'Waiting to send',sending:'Sending',accepted:'Accepted by provider · delivery unconfirmed',failed:'Could not send',unknown:'Delivery uncertain · not resent',unavailable:'Delivery service not configured',suppressed:'Superseded or opted out',expired:'Sending window ended'};
export async function refreshAlerts(node,api,jid,tid,signal) {
  if(!node)return;
  try {
    const rows=await api.ticketAlerts(jid,tid,signal);
    if(signal.aborted||!node.isConnected)return;
    node.innerHTML=`<h3>Booking alerts</h3>${rows.length?`<ul class="alert-history">${rows.map(r=>`<li><b>${esc(events[r.event]||r.event)} · ${esc(r.channel==='whatsapp'?'WhatsApp':r.channel==='sms'?'SMS':'Email')}</b><span>${esc(states[r.state]||'Status unavailable')}</span></li>`).join('')}</ul>`:'<p>No external alerts were requested for this booking.</p>'}<a class="text-btn" href="#/profile">Manage booking alerts →</a>`;
  } catch {if(!signal.aborted&&node.isConnected)node.textContent='Alert status is unavailable. Your booking is recorded in My trips.';}
}
