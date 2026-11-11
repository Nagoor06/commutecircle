import {head, icon, esc} from '../ui.js';

export function mount({root, auth, query, go}) {
  if (auth.signed) { go('profile'); return; }
  const message = auth.problem || (query.get('reason') === 'expired' ? 'Your session ended. Sign in again to continue.' : '');
  root.innerHTML = head('Your account', 'Welcome to CommuteCircle', 'Share the journey. Keep your world private.') +
    `<section class="panel sign-in-card"><span class="empty-icon">${icon('shield',28)}</span>
    <h2>Your rides, in one place</h2><p>Browse freely. Sign in to book, offer a ride, save your commute and message your driver.</p>
    <button class="btn primary wide" data-start="login">Continue to secure sign-in ${icon('arrow')}</button>
    <button class="btn secondary wide" data-start="signup">Create an account</button>
    <p class="fine">You’ll continue on our Auth0 login page, then return here. CommuteCircle never receives your password.</p>
    <details class="policy"><summary>Already registered or having trouble?</summary><p>Choose Sign in with the same email and login method you used before. For an email/password account, use “Forgot password?” on the secure login page. A generic registration error can also mean the account already exists; we cannot confirm that from this page.</p></details>
    <p data-status role="status">${esc(message)}</p><a class="text-btn" href="#/book">Keep browsing rides</a></section>`;
  for (const button of root.querySelectorAll('[data-start]')) button.onclick = async () => {
    root.querySelector('[data-status]').textContent = 'Opening secure sign-in…';
    await auth.begin(button.dataset.start);
  };
}
