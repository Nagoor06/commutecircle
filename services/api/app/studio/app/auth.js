const savedKey = 'cc-pkce';
const base64url = bytes => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_')
  .replaceAll('=', '');
const random = () => base64url(crypto.getRandomValues(new Uint8Array(32)));
const callback = () => new URL('./', location.href).href;
const loopback = host => ['localhost', '127.0.0.1', '[::1]'].includes(host);

// Service origins come only from operator-owned configuration; URL parameters never set a token destination.
export function trustedOrigin(value) {
  if (!value) return null;
  const u = new URL(value);
  if (u.username || u.password || u.pathname !== '/' || u.search || u.hash ||
    (u.protocol !== 'https:' && !(loopback(u.hostname) && u.protocol === 'http:'))) throw Error(
    'Invalid booking service origin.');
  return u.origin;
}

async function signInConfig(apiOrigin) {
  let response;
  try {
    response = await fetch(apiOrigin + '/v1/studio-config', {signal: AbortSignal.timeout(90000)});
    if (!response.ok) throw Error();
  } catch {
    throw Error('Could not reach the booking service. Try signing in again.');
  }
  const config = await response.json();
  if (!config.issuer || !config.client_id) throw Error('Sign-in is not yet configured for this service.');
  return config;
}

export async function session(settings) {
  const local = location.pathname === '/studio/' || location.pathname === '/studio/index.html';
  let apiOrigin;
  try {
    apiOrigin = local ? location.origin : trustedOrigin(settings.apiOrigin)
  } catch {
    return {
      problem: 'The booking service configuration is unavailable.'
    }
  }
  if (!apiOrigin) return {
    problem: 'Live bookings are not connected at this address yet.'
  };
  const query = new URLSearchParams(location.search);
  if (!query.has('code') && !query.has('error')) return {apiOrigin};
  history.replaceState(null, '', callback());
  try {
    const saved = JSON.parse(sessionStorage.getItem(savedKey) || 'null');
    sessionStorage.removeItem(savedKey);
    if (query.has('error') || !saved || saved.state !== query.get('state') || saved.apiOrigin !== apiOrigin)
      return {
        apiOrigin,
        problem: 'Sign-in could not be confirmed. Please try again.'
      };
    const config = await signInConfig(apiOrigin);
    const response = await fetch(new URL('oauth/token', config.issuer), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: config.client_id,
        code: query.get('code'),
        code_verifier: saved.verifier,
        grant_type: 'authorization_code',
        redirect_uri: callback()
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) return {
      config,
      apiOrigin,
      problem: 'Sign-in failed. Please try again.'
    };
    const result = await response.json();
    if (!result.access_token) throw Error();
    if (saved.route?.startsWith('#/')) history.replaceState(null, '', callback() + saved.route);
    return {
      config,
      apiOrigin,
      token: result.access_token
    };
  } catch {
    return {
      apiOrigin,
      problem: 'The booking service is temporarily unavailable.'
    }
  }
}
export async function signIn(session) {
  const {apiOrigin} = session;
  const config = session.config || await signInConfig(apiOrigin);
  const verifier = random(),
    state = random(),
    digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  sessionStorage.setItem(savedKey, JSON.stringify({
    verifier,
    state,
    apiOrigin,
    route: location.hash
  }));
  const url = new URL('authorize', config.issuer);
  url.search = new URLSearchParams({
    client_id: config.client_id,
    response_type: 'code',
    redirect_uri: callback(),
    audience: config.audience,
    scope: 'openid rides:read rides:write',
    state,
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256'
  });
  location.assign(url);
}
