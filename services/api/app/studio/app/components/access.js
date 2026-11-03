import {
  head,
  empty,
  icon,
  esc
} from '../ui.js';
export function access(ctx, title, task) {
  const {
    root,
    auth
  } = ctx;
  root.innerHTML = head('Your workspace', title) + `<section class="empty access"><span class="empty-icon">${icon('user',25)}</span>
    <h2>${auth.enabled?'Sign in to continue':'Bookings unavailable'}</h2>
    <p>${esc(auth.problem||(auth.enabled?task:'The shared booking service is not connected at this address yet.'))}</p>
    ${auth.enabled?'<button class="btn primary" data-login>Sign in</button>':''}
    <a class="btn secondary" href="#/book">Plan a route</a></section>`;
  const btn = root.querySelector('[data-login]');
  if (btn) btn.onclick = auth.login;
}
