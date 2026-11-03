import {
  icon
} from './ui.js';
import {
  session,
  signIn
} from './auth.js';
import {
  liveClient
} from './data/live.js';
import {restorePlan, rememberPlan, forgetPlan} from './data/plan.js';
import {
  startRouter
} from './router.js';
const items = [
  ['find', 'compass', 'Book a ride'],
  ['offer', 'car', 'Offer a ride'],
  ['trips', 'ticket', 'My trips'],
  ['help', 'help', 'Help']
];
document.querySelector('.primary-nav').innerHTML = items.map(([route, symbol, title]) =>
  `<a href="#/${route==='find'?'book':route}" data-nav="${route}">${icon(symbol,18)}<span>${title}</span></a>`
  ).join('');
let settings = {};
try {
  const response = await fetch(new URL('app-settings.json', document.baseURI), {
    cache: 'no-cache'
  });
  if (response.ok) settings = await response.json();
} catch {}
const query = new URLSearchParams(location.search);
if (query.has('code') || query.has('error')) {
  document.querySelector('.startup').textContent = 'Finishing sign-in…';
}
const auth = await session(settings);
const api = auth.token ? liveClient(auth.token, auth.apiOrigin) : null;
const account = document.querySelector('#account');
account.innerHTML = auth.apiOrigin ? '<button class="account-btn" data-auth>' + icon('user', 16) + (api ?
  'Sign out' : 'Sign in') + '</button>' : '<span class="mode">' + icon('user', 13) + ' Guest</span>';
const gate = account.querySelector('[data-auth]');
const accountStatus = document.querySelector('#account-status');
async function login() {
  if (!gate || gate.disabled) return;
  gate.disabled = true;
  accountStatus.hidden = false;
  accountStatus.textContent = 'Connecting to sign-in… Your route will be here when you return.';
  try {
    await signIn(auth)
  } catch (error) {
    gate.disabled = false;
    accountStatus.textContent = error.message || 'Sign-in is unavailable. Please try again.';
  }
}
let signingOut = false;
if (gate) gate.onclick = () => {
  if (api) {
    signingOut = true;
    forgetPlan();
    location.replace(new URL('./', location.href));
    return
  }
  login()
};
const state = {
  ...restorePlan(),
  offer: null,
  landmark: '',
  checkoutKeys: new Map()
};
window.addEventListener('pagehide', () => {
  if (!signingOut) rememberPlan(state);
});
try {
  const raw = sessionStorage.getItem('cc:offer-signin');
  if (auth.token && raw) {
    sessionStorage.removeItem('cc:offer-signin');
    const saved = JSON.parse(raw);
    if (saved.until > Date.now() && saved.draft?.stops?.length >= 2) state.offer = saved.draft;
  }
} catch {}
startRouter({
  api,
  state,
  auth: {
    enabled: !!auth.apiOrigin,
    help: !!auth.config?.ride_help_enabled,
    problem: auth.problem,
    login
  },
  geocoder: settings.placeSearchUrl ?? null
});
