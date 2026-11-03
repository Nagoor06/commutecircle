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
import {
  places
} from './data/places.js';
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
const auth = await session(settings);
const api = auth.token ? liveClient(auth.token, auth.apiOrigin) : null;
const account = document.querySelector('#account');
account.innerHTML = auth.config ? '<button class="account-btn" data-auth>' + icon('user', 16) + (api ?
  'Sign out' : 'Sign in') + '</button>' : '<span class="mode">' + icon('user', 13) + ' Guest</span>';
async function login() {
  try {
    await signIn(auth)
  } catch {
    account.querySelector('button').textContent = 'Retry sign-in'
  }
}
const gate = account.querySelector('[data-auth]');
if (gate) gate.onclick = () => {
  if (api) {
    location.replace(new URL('./', location.href));
    return
  }
  login()
};
const state = {
  route: [{
    ...places[0]
  }, {
    ...places[1]
  }],
  date: '',
  query: null,
  offer: null,
  landmark: '',
  checkoutKeys: new Map()
};
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
    enabled: !!auth.config,
    help: !!auth.config?.ride_help_enabled,
    problem: auth.problem,
    login
  },
  geocoder: settings.placeSearchUrl ?? null
});
