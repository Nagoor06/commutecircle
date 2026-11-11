import {forgetPlan} from './data/plan.js';

const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-')
  .replaceAll('/', '_').replaceAll('=', '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const callback = () => new URL('./', location.href).href;
const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);
const pkceKey = () => 'cc:pkce:' + callback();
const interruptedKey = () => 'cc:finishing:' + callback();
const validId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
const providerId = config => JSON.stringify([config.issuer, config.client_id, config.audience]);
const expired = 'Your session ended. Sign in again to continue.';
const unavailable = 'Could not restore your session. Refresh to try again.';

export function trustedOrigin(value) {
  if (!value) return null;
  const u = new URL(value);
  if (u.username || u.password || u.pathname !== '/' || u.search || u.hash ||
    (u.protocol !== 'https:' && !(loopback(u.hostname) && u.protocol === 'http:'))) {
    throw Error('Invalid booking service origin.');
  }
  return u.origin;
}

async function signInConfig(apiOrigin) {
  let response;
  try {
    response = await fetch(apiOrigin + '/v1/studio-config', {cache:'no-store', signal:AbortSignal.timeout(90000)});
    if (!response.ok) throw Error();
  } catch {
    throw Error('Could not reach the booking service. Try signing in again.');
  }
  const config = await response.json();
  if (!config.issuer || !config.client_id) throw Error('Sign-in is not yet configured for this service.');
  return config;
}

function sessionStore(apiOrigin) {
  const key = 'cc:session:' + callback() + ':' + apiOrigin;
  let storage;
  try { storage = window.localStorage; storage.getItem(key); }
  catch {
    try { storage = window.sessionStorage; storage.getItem(key); }
    catch { throw Error('Allow site storage in this browser to sign in.'); }
  }
  return {
    key,
    read() {
      try {
        const record = JSON.parse(storage.getItem(key));
        return validId(record?.id) && (!record.account || validId(record.account)) ? record : {};
      } catch { return {}; }
    },
    write(record) { storage.setItem(key, JSON.stringify(record)); }
  };
}

function readPending(key) {
  try { return JSON.parse(sessionStorage.getItem(key)); } catch { return null; }
}

function forgetPending(key) {
  try { sessionStorage.removeItem(key); } catch {}
}

function savePending(key, record) {
  try { sessionStorage.setItem(key, JSON.stringify(record)); }
  catch { throw Error('Allow site storage in this browser to sign in.'); }
}

function returnRoute() {
  const route = location.hash.startsWith('#/signin') ?
    new URLSearchParams(location.hash.split('?')[1]).get('return') : location.hash;
  return safeRoute(route);
}

// The public tracking fragment contains a private sharing token.
function safeRoute(route) {
  return typeof route === 'string' && route.startsWith('#/') &&
    !/^#\/(?:track|signin)(?:[/?]|$)/.test(route) ? route : '#/book';
}

async function tokenIdentity(token, issuer, binding) {
  const payload = token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
  const claims = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload), c => c.charCodeAt(0))));
  if (!claims.sub || claims.iss !== issuer || !(claims.exp * 1000 > Date.now())) throw Error(expired);
  // Only an account-change check. The API verifies the signed JWT for authorization.
  const bytes = new TextEncoder().encode(JSON.stringify([binding, claims.iss, claims.sub]));
  return {
    account:base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))),
    expiresAt:claims.exp * 1000
  };
}

function cacheRequest(auth, id, method, token) {
  return fetch(auth.apiOrigin + '/v1/studio-session', {
    method, credentials:'include', cache:'no-store', redirect:'error',
    headers:{'X-Studio-Session':id, ...(token ? {Authorization:'Bearer ' + token} : {})},
    signal:AbortSignal.timeout(10000), keepalive:method === 'DELETE'
  });
}

export function endSession(auth) {
  forgetPlan();
  auth.token = null;
  forgetPending(pkceKey());
  forgetPending(interruptedKey());
  const current = auth.store.read();
  if (current.id !== auth.record.id) return;
  // Keep a fresh generation so a late callback in another tab cannot undo sign-out.
  auth.record = {id:random()};
  auth.store.write(auth.record);
  if (current.account && auth.config?.studio_session_cache) {
    cacheRequest(auth, current.id, 'DELETE').catch(() => {});
  }
}

async function authorize(auth, mode, route, previousStaff) {
  if (!auth.store) throw Error('Allow site storage in this browser to sign in.');
  const config = auth.config || await signInConfig(auth.apiOrigin);
  const resume = mode === 'resume';
  const silent = resume || mode === 'recover';
  const staff = silent ? (previousStaff ?? auth.record.staff) : route.split('?')[0] === '#/staff';
  const verifier = random(), state = random();
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  savePending(pkceKey(), {
    state, verifier, apiOrigin:auth.apiOrigin, provider:providerId(config), previous:auth.record.id,
    created:Date.now(), route, staff, resume, silent
  });
  const url = new URL('authorize', config.issuer);
  url.search = new URLSearchParams({
    client_id:config.client_id, response_type:'code', redirect_uri:callback(),
    audience:config.audience, scope:'openid email rides:read rides:write' + (staff ? ' v2:staff' : ''),
    state, code_challenge:base64url(new Uint8Array(digest)), code_challenge_method:'S256'
  });
  if (silent) {
    url.searchParams.set('prompt', 'none');
    location.replace(url);
  } else {
    if (mode === 'staff' || (mode === 'login' && auth.record.id && !auth.record.account)) {
      url.searchParams.set('prompt', 'login');
    }
    if (mode === 'signup' && !staff) url.searchParams.set('screen_hint', 'signup');
    location.assign(url);
  }
}

export const signIn = (auth, mode = 'login') => authorize(auth, mode, returnRoute());

function signInRoute(route, reason) {
  const query = new URLSearchParams({return:route});
  if (reason) query.set('reason', reason);
  history.replaceState(null, '', callback() + '#/signin?' + query);
}

export function expiredSession(auth) {
  const route = returnRoute();
  endSession(auth);
  signInRoute(route, 'expired');
  location.reload();
}

async function complete(auth, query) {
  const saved = readPending(pkceKey());
  history.replaceState(null, '', callback());
  if (!saved && !auth.record.id) {
    // A login started by the previous release can finish after a deployment.
    const old = readPending('cc-pkce');
    if (old?.apiOrigin === auth.apiOrigin && validId(old.state) && old.state === query.get('state')) {
      forgetPending('cc-pkce');
      const route = safeRoute(old.route);
      if (query.has('code')) {
        await authorize(auth, 'recover', route, route.split('?')[0] === '#/staff');
        auth.redirecting = true;
      } else {
        signInRoute(route);
        auth.problem = 'Sign-in was not completed. Please try again.';
      }
      return;
    }
  }
  if (!saved || saved.state !== query.get('state') || saved.apiOrigin !== auth.apiOrigin) {
    auth.problem = 'Sign-in could not be confirmed. Please try again.';
    return;
  }
  forgetPending(pkceKey());
  if (saved.previous !== auth.store.read().id || !recent(saved)) {
    auth.problem = 'This sign-in has ended. Start a new sign-in to continue.';
    return;
  }
  history.replaceState(null, '', callback() + saved.route);
  if (query.has('error')) {
    const ended = ['login_required','consent_required','interaction_required','account_selection_required','access_denied']
      .includes(query.get('error'));
    if (saved.resume && ended) endSession(auth);
    auth.problem = saved.silent ? (ended ? expired : unavailable) : 'Sign-in was not completed. Please try again.';
    signInRoute(saved.route, saved.resume && ended ? 'expired' : undefined);
    return;
  }
  if (!saved.silent) {
    // If the page reloads mid-exchange, recover with a new code, at most once.
    const {previous, created, route, staff, provider, apiOrigin} = saved;
    savePending(interruptedKey(), {previous, created, route, staff, provider, apiOrigin});
  }
  auth.config = await signInConfig(auth.apiOrigin);
  if (providerId(auth.config) !== saved.provider) throw Error('The sign-in configuration changed. Sign in again.');
  const response = await fetch(new URL('oauth/token', auth.config.issuer), {
    method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', redirect:'error',
    body:JSON.stringify({
      client_id:auth.config.client_id, code:query.get('code'), code_verifier:saved.verifier,
      grant_type:'authorization_code', redirect_uri:callback()
    }),
    signal:AbortSignal.timeout(15000)
  });
  if (!response.ok) throw Error('Sign-in could not finish. Please try signing in again.');
  const {access_token:token} = await response.json();
  const id = saved.resume ? auth.record.id : random();
  const identity = await tokenIdentity(token, auth.config.issuer, id).catch(() => null);
  if (!identity) throw Error('The login provider returned an unusable or expired access token. Sign in again.');
  const {account, expiresAt} = identity;
  if (saved.resume && account !== auth.record.account) {
    endSession(auth);
    signInRoute(saved.route);
    throw Error('The login provider changed accounts. Sign in to choose your account.');
  }
  const record = saved.resume ? auth.record : {
    id, account, staff:saved.staff, provider:saved.provider
  };
  if (auth.store.read().id !== saved.previous) throw Error('Your session changed in another tab.');
  if (auth.config.studio_session_cache) {
    // Browsers that decline the cookie can still resume through the provider.
    const cached = await cacheRequest(auth, record.id, 'PUT', token).catch(() => null);
    if (cached?.status === 401) {
      if (saved.resume) endSession(auth);
      throw Error('The booking service could not verify the sign-in. Please sign in again.');
    }
  }
  if (auth.store.read().id !== saved.previous) throw Error('Your session changed in another tab.');
  if (!saved.resume) {
    if (auth.record.account) forgetPlan();
    auth.store.write(record);
  }
  auth.record = record;
  auth.token = token;
  auth.expiresAt = expiresAt;
}

function recent(saved) {
  const age = Date.now() - saved.created;
  return age >= 0 && age < 600000;
}

export async function session(settings) {
  const local = ['/studio/', '/studio/index.html'].includes(location.pathname);
  let apiOrigin;
  try { apiOrigin = local ? location.origin : trustedOrigin(settings.apiOrigin); }
  catch { return {problem:'The booking service configuration is unavailable.'}; }
  if (!apiOrigin) return {problem:'Live bookings are not connected at this address yet.'};
  const auth = {apiOrigin};
  try {
    auth.store = sessionStore(apiOrigin);
    auth.record = auth.store.read();
    const query = new URLSearchParams(location.search);
    if (query.has('code') || query.has('error')) {
      await complete(auth, query);
      if (auth.token) forgetPending(interruptedKey());
      return auth;
    }
    const interrupted = readPending(interruptedKey());
    if (interrupted) {
      forgetPending(interruptedKey());
      if (recent(interrupted) && interrupted.apiOrigin === apiOrigin && interrupted.previous === auth.record.id &&
          !/^#\/track(?:[/?]|$)/.test(location.hash)) {
        auth.config = await signInConfig(apiOrigin);
        if (providerId(auth.config) === interrupted.provider) {
          await authorize(auth, 'recover', interrupted.route, interrupted.staff);
          return {...auth, redirecting:true};
        }
      }
    }
    if (auth.record.account && !/^#\/track(?:[/?]|$)/.test(location.hash)) {
      auth.config = await signInConfig(apiOrigin);
      if (providerId(auth.config) !== auth.record.provider) {
        endSession(auth);
        throw Error('The sign-in configuration changed. Please sign in again.');
      }
      if (auth.config.studio_session_cache) {
        const response = await cacheRequest(auth, auth.record.id, 'POST').catch(() => null);
        if (response?.ok) {
          const {access_token} = await response.json();
          const restored = await tokenIdentity(access_token, auth.config.issuer, auth.record.id).catch(() => null);
          if (auth.store.read().id === auth.record.id && restored?.account === auth.record.account) {
            auth.expiresAt = restored.expiresAt;
            auth.token = access_token;
            return auth;
          }
        } else if (response?.status >= 500) throw Error(unavailable);
      }
      if (auth.store.read().id === auth.record.id) {
        await authorize(auth, 'resume', returnRoute());
        auth.redirecting = true;
      }
    }
  } catch (error) {
    auth.problem = error.message || unavailable;
  }
  return auth;
}
