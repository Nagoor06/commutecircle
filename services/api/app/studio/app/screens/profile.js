import {head, icon, esc, notice, pending} from '../ui.js';
import {access} from '../components/access.js';
import {fieldMarkup, attachField} from '../components/place-field.js';
import {stopFromPlace, isSame} from '../data/places.js';
import {contactsMarkup, bindContacts} from '../components/trusted-contacts.js';

export async function mount(ctx) {
  const {root, api, auth, state, geocoder, signal, go} = ctx;
  if (!api || !auth.signed) return access(ctx, 'My profile', 'Sign in to save your private commute preferences.');
  root.innerHTML = '<p class="loading">Opening your profile…</p>';
  const saved = await api.commute(signal);
  if (signal.aborted) return;
  state.commute = saved;
  root.innerHTML = head('Account / Private preferences', 'My profile', 'A familiar commute, without sharing your front door.') +
    `<div class="details-grid"><form class="panel" data-profile><div class="panel-cap">${icon('route')} My office commute</div>
    <label class="field">Where do you work? <small>Optional · visible only to you</small><input name="employer" maxlength="80" placeholder="Company or office nickname" value="${esc(saved?.employer || '')}"></label>
    ${fieldMarkup('node', saved?.pickup || {name:''}, {label:'Public pickup point',badge:'A'})}
    ${fieldMarkup('work', saved?.workplace || {name:''}, {label:'Office-area meeting point',badge:'B'})}
    <label class="checkline"><input type="checkbox" name="public" required ${saved?'checked':''}> These are public meeting points, not my home or a private entrance.</label>
    <button class="btn primary" type="submit">Save my commute</button><button class="text-btn" type="button" data-forget>Delete saved commute</button>
    <div data-notice role="status" hidden></div></form>
    <aside class="stack"><section class="panel accent-panel"><div class="panel-cap">${icon('shield')} Circle pickup</div><h2>Your pickup is a public place.</h2>
    <p>Drivers see the booked meeting points. Your employer label and saved preferences stay in your account.</p><p>“Find public stops near me” compares device location with our station catalogue in your browser. It sends no device coordinates to the server.</p>
    <p class="fine">Public points are suggestions, not verified safe places. Check access, lighting and the actual meeting spot.</p></section>
    <a class="btn secondary" href="#/trips">My bookings & offers ${icon('arrow')}</a></aside></div>` + contactsMarkup();
  const fields = [...root.querySelectorAll('[data-field]')].map((node,i) => attachField(node, {
    initial: (i?saved?.workplace:saved?.pickup) || {name:''}, update:()=>{}, onDraft:()=>{},
    geocoder, signal, info:m=>notice(root,m),
    anchor:()=>{try{return fields[1-i]?.value()}catch{return null}}
  }));
  root.querySelector('form').onsubmit = e => {e.preventDefault(); pending(e.submitter, async()=>{
    const [pickup, workplace] = fields.map(f=>stopFromPlace(f.value()));
    if (isSame(pickup,workplace)) throw Error('Choose different pickup and workplace points.');
    const data = {pickup,workplace,employer:root.querySelector('[name=employer]').value.trim(),public_points_confirmed:true};
    await api.saveCommute(data);
    state.commute = data; state.route = [pickup,workplace];
    state.query = {origin:pickup,destination:workplace,prefer_commute:true};
    if (!signal.aborted) go('book');
  },m=>notice(root,m,'error')); };
  root.querySelector('[data-forget]').onclick = e => pending(e.currentTarget,async()=>{
    await api.forgetCommute(); state.commute = null; state.query = null;
    fields.forEach(f=>f.set({name:''})); root.querySelector('[name=employer]').value='';
    notice(root,'Saved commute deleted.','info');
  },m=>notice(root,m,'error'));
  await bindContacts(root.querySelector('.trusted-contacts'),api,signal);
}
