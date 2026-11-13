// Only icon names from this table can introduce SVG markup.
const paths = {
  message: '<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z"/><path d="M7 9h10M7 13h7"/>',
  snowflake: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4M17 19l-1-4 4-1M4 14l4 1-1 4M17 5l-1 4 4 1"/>',
  quiet: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5M5.2 8a7 7 0 0 1 11.5-3L20 8M4 16l3.3 3A7 7 0 0 0 18.8 16"/>',
  sliders: '<path d="M3 6h7m4 0h7M3 12h13m4 0h1M3 18h3m4 0h11M10 3v6m6 0v6M6 15v6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
  car: '<path d="m3 15 1-6 2-4h12l2 4 1 6v3h-3v-2H6v2H3zM5 10h14M6 13h2m8 0h2"/>',
  ticket: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4Z"/><path d="M8 8v2m0 4v2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.3 9.2a2.8 2.8 0 1 1 4.1 2.5c-1 .6-1.4 1-1.4 2.3m0 2h.01"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H5m6-6-6 6 6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.3"/>',
  swap: '<path d="M8 19V5L4 9m12-4v14l4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',
  target: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8Zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  fit: '<path d="M4 9V4h5m6 0h5v5m0 6v5h-5m-6 0H4v-5"/>',
  minus: '<path d="M5 12h14"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  route: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 6h8a4 4 0 0 1 0 8H9a2 2 0 0 0 0 4h8"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  seat: '<path d="M6 4h3v9h9a2 2 0 0 1 2 2v2H8a3 3 0 0 1-3-3V4zm2 13-1 3m10-3 1 3"/>',
  star: '<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.5l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9Z"/>',
  shield: '<path d="m12 3 8 3v5c0 6-5 9-8 11-3-2-8-5-8-11V6Z"/><path d="m8.5 12 2 2 4.5-5"/>',
  copy: '<rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v13h5"/>',
  user: '<circle cx="12" cy="8" r="3.5"/><path d="M4.5 21v-2c0-6.5 15-6.5 15 0v2"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20M16 5a3.2 3.2 0 0 1 0 6.2m1.5 3a5.3 5.3 0 0 1 4 5.1v.7"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  wallet: '<path d="M4 6h15v14H4zM4 6l12-3v3"/><path d="M20 11h-6v4h6"/>',
  spark: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11h.01"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h1m-1 6h1m-1 6h1"/>',
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2Zm6-2v16m6-14v16"/>',
  flag: '<path d="M5 22V3m0 1c6-4 8 4 14 0v10c-6 4-8-4-14 0"/>',
};
export function icon(name, size = 18) {
  return '<svg class="icon" width="' + size + '" height="' + size +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (paths[name] || '') + '</svg>';
}
export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
} [c]));
export const money = paise => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: paise % 100 ? 2 : 0
}).format(paise / 100);
export const clock = value => new Date(value).toLocaleTimeString('en-IN', {
  hour: 'numeric',
  minute: '2-digit'
});
export const day = value => new Date(value).toLocaleDateString('en-IN', {
  weekday: 'short',
  day: 'numeric',
  month: 'short'
});
export const head = (kicker, title, intro = '') =>
  `<header class="page-head"><div class="eyebrow"><i></i>${esc(kicker)}</div><h1>${esc(title)}</h1>${intro?`<p>${esc(intro)}</p>`:''}</header>`;
export const back = (url, label) => `<a class="back" href="${esc(url)}">${icon('back',15)} ${esc(label)}</a>`;
export function empty(title, detail, url, label) {
  return `<div class="empty"><span class="empty-icon">${icon('compass',26)}</span><h2>${esc(title)}</h2><p>${esc(detail)}</p>${url?`<a class="btn secondary" href="${esc(url)}">${esc(label)} ${icon('arrow')}</a>`:''}</div>`;
}
export function notice(root, message, kind = 'info') {
  const node = root.querySelector('[data-notice]');
  if (node) {
    node.className = 'notice ' + kind;
    node.textContent = message;
    node.hidden = !message
  }
}
export function pending(button, fn, onError) {
  if (button.disabled) return;
  const restoreFocus=document.activeElement===button;
  button.disabled = true;
  button.setAttribute('aria-busy', 'true');
  return Promise.resolve().then(fn).catch(e => onError(e.message || 'Something went wrong.')).finally(() => {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if(restoreFocus && button.isConnected && document.activeElement===document.body)button.focus({preventScroll:true});
  });
}
let dialogId = 0;
export function confirmation(title, message, label, {danger=false, signal, details=[]}={}) {
  if(signal?.aborted)return Promise.resolve(false);
  const id='confirmation-'+ ++dialogId;
  const dialog=document.createElement('dialog');
  dialog.className='dialog'+(danger?' destructive':'');
  dialog.setAttribute('aria-labelledby',id+'-title');
  dialog.setAttribute('aria-describedby',id+'-description');
  dialog.innerHTML=`<form method="dialog">
    <div class="dialog-body"><div class="dialog-tools"><span class="dialog-symbol">${icon(danger?'info':'shield',22)}</span>
    <button type="button" class="dialog-close" aria-label="Close dialog">${icon('close',18)}</button></div>
    <h2 id="${id}-title">${esc(title)}</h2><p id="${id}-description">${esc(message)}</p>
    ${details.length?`<dl class="dialog-details">${details.map(([name,value])=>`<div><dt>${esc(name)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`:''}
    </div><div class="dialog-actions"><button class="btn secondary" value="no" autofocus>Go back</button>
    <button class="btn ${danger?'danger':'primary'}" value="yes">${esc(label)}</button></div></form>`;
  document.body.append(dialog);
  return new Promise(resolve=>{
    const close=()=>{if(dialog.open)dialog.close('no');};
    dialog.querySelector('.dialog-close').onclick=close;
    const onBackdrop=e=>{
      if(e.target!==dialog)return false;
      const box=dialog.getBoundingClientRect();
      return e.clientX<box.left || e.clientX>box.right || e.clientY<box.top || e.clientY>box.bottom;
    };
    let pressedOutside=false;
    dialog.onpointerdown=e=>{pressedOutside=onBackdrop(e);};
    dialog.onclick=e=>{if(pressedOutside && onBackdrop(e))close();pressedOutside=false;};
    dialog.addEventListener('close',()=>{
      signal?.removeEventListener('abort',close);
      const accepted=!signal?.aborted && dialog.returnValue==='yes';
      dialog.remove();
      resolve(accepted);
    },{once:true});
    dialog.showModal();
    signal?.addEventListener('abort',close,{once:true});
  });
}
export function dateInput(date = new Date()) {
  return new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function dateTimeInput(date) {
  return new Date(+date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
