import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export async function offlineLogin(context, base, role, token) {
  let challenge, code;
  await context.route('https://identity.test/**', async route => {
    const req = route.request(),
      url = new URL(req.url()),
      headers = {
        'access-control-allow-origin': base,
        'access-control-allow-headers': 'Content-Type',
        'access-control-allow-methods': 'POST, OPTIONS'
      };
    if (req.method() === 'OPTIONS') return route.fulfill({
      status: 204,
      headers
    });
    if (url.pathname === '/authorize') {
      assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
      assert.equal(url.searchParams.get('scope').split(' ').includes('v2:staff'), role === 'reviewer');
      challenge = url.searchParams.get('code_challenge');
      code = 'code-' + role;
      const redirect = new URL(url.searchParams.get('redirect_uri'));
      assert.equal(redirect.href, base + '/studio/');
      redirect.search = new URLSearchParams({
        code,
        state: url.searchParams.get('state')
      });
      return route.fulfill({
        status: 302,
        headers: {
          location: redirect.href
        },
        body: ''
      });
    }
    assert.equal(url.pathname, '/oauth/token');
    const payload = req.postDataJSON();
    assert.ok(code);
    assert.equal(payload.code, code);
    assert.equal(createHash('sha256').update(payload.code_verifier).digest('base64url'),
      challenge);
    code = null;
    return route.fulfill({
      headers,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: token
      })
    });
  });
}
