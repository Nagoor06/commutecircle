import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';

export async function offlineLogin(context, base, role, token, options = {}) {
  const codes = new Map();
  const redirectUri = options.redirectUri || base + '/studio/';
  await context.route('https://identity.test/**', async route => {
    const req = route.request(), url = new URL(req.url());
    const headers = {
      'access-control-allow-origin': new URL(redirectUri).origin,
      'access-control-allow-headers': 'Content-Type',
      'access-control-allow-methods': 'POST, OPTIONS'
    };
    if (req.method() === 'OPTIONS') return route.fulfill({status:204, headers});
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('scope').split(' ').includes('v2:staff'), role === 'reviewer');
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      assert.equal(redirect.href, redirectUri);
      const error = options.onAuthorize?.(url.searchParams);
      redirect.searchParams.set('state', url.searchParams.get('state'));
      if (error) {
        redirect.searchParams.set('error', error);
      } else {
        const code = randomUUID();
        codes.set(code, url.searchParams.get('code_challenge'));
        redirect.searchParams.set('code', code);
      }
      return route.fulfill({status:302, headers:{location:redirect.href}, body:''});
    }
    assert.equal(url.pathname, '/oauth/token');
    const payload = req.postDataJSON();
    assert.equal(payload.redirect_uri, redirectUri);
    assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'), codes.get(payload.code));
    codes.delete(payload.code);
    const issued = options.issueToken ? await options.issueToken() : token;
    return route.fulfill({headers, json:{access_token:issued}}).catch(error => {
      if (!options.allowInterruptedExchange) throw error;
    });
  });
}
