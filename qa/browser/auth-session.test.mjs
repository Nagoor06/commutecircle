import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base = 'http://127.0.0.1:8765';
const tokens = JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES, 'utf8'));
const account = page => page.locator('#account button');
const signed = page => account(page).filter({hasText:'Sign out'}).waitFor();
const guest = page => account(page).filter({hasText:/Sign in/}).waitFor();

async function openStudio(t, options = {}) {
  const browser = await chromium.launch({
    executablePath:process.env.CHROME_PATH || '/usr/bin/google-chrome', args:['--no-sandbox']
  });
  t.after(() => browser.close());
  const context = await browser.newContext();
  context.setDefaultTimeout(12000);
  const role = options.role || 'rider';
  await offlineLogin(context, base, role, tokens[role], options);
  const page = await context.newPage();
  return {context, page};
}

async function login(page, path = 'trips', studio = '/studio/') {
  await page.goto(base + studio + '#/' + path);
  await account(page).click();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
  await signed(page);
}

test('refresh restores the signed-in trips screen, account and V2 capabilities', async t => {
  const {page} = await openStudio(t);
  await login(page, 'circles');
  for (let i = 0; i < 2; i++) {
    await page.reload();
    await signed(page);
    await page.getByLabel('Circle name').waitFor();
    assert.equal(new URL(page.url()).hash, '#/circles');
  }
  const storage = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  assert.equal(storage.includes(tokens.rider), false);
});

test('two tabs share the current browser account and signing out clears both across reloads', async t => {
  const {context, page} = await openStudio(t);
  await login(page);
  const other = await context.newPage();
  await other.goto(base + '/studio/#/circles');
  await signed(other);
  await other.getByLabel('Circle name').waitFor();
  const parked = await context.newPage();
  await parked.goto(base + '/studio/#/circles');
  await signed(parked);
  await parked.goto(base + '/health/ready');
  await account(page).click();
  await guest(page);
  await guest(other);
  await parked.goBack();
  await guest(parked);
  assert.equal(await parked.getByLabel('Circle name').count(), 0);
  assert.equal(await other.getByLabel('Circle name').count(), 0);
  for (const tab of [page, other]) {
    await tab.reload();
    await guest(tab);
  }
});

test('a separately hosted Studio recovers across origins and keeps the trip history filter', async t => {
  const front = 'http://localhost:8765/commutecircle/';
  const prompts = [];
  const {context, page} = await openStudio(t, {
    redirectUri:front, onAuthorize:params => { prompts.push(params.get('prompt')); }
  });
  await context.route(front + 'app-settings.json', r => r.fulfill({json:{apiOrigin:base}}));
  await page.goto(front + '#/trips?view=driving&when=history');
  await account(page).click();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
  await signed(page);
  const recovered = page.waitForResponse(response =>
    response.url() === base + '/v1/studio-session' && response.request().method() === 'POST');
  await page.reload();
  assert.equal((await recovered).status(), 200);
  await signed(page);
  await page.locator('a[aria-current="page"]').filter({hasText:'History'}).waitFor();
  assert.equal(new URL(page.url()).hash, '#/trips?view=driving&when=history');
  assert.deepEqual(prompts, [null]);
});

test('blocked session cookies use one first-party renewal with the original staff scope', async t => {
  const prompts = [];
  const {context, page} = await openStudio(t, {
    role:'reviewer', onAuthorize:params => { prompts.push(params.get('prompt')); }
  });
  await login(page, 'staff');
  await page.getByRole('heading', {name:'Trust & safety review'}).waitFor();
  await page.getByRole('navigation').getByRole('link', {name:'My trips'}).click();
  await context.clearCookies();
  await page.reload();
  await signed(page);
  assert.equal(new URL(page.url()).hash, '#/trips');
  assert.deepEqual(prompts, [null, 'none']);
  await page.evaluate(() => { location.hash = '/staff'; });
  await page.getByRole('heading', {name:'Trust & safety review'}).waitFor();
});

test('an expired provider session prompts once, then returns to the original route after sign-in', async t => {
  const prompts = [];
  const {context, page} = await openStudio(t, {onAuthorize:params => {
    const prompt = params.get('prompt');
    prompts.push(prompt);
    if (prompt === 'none') return 'login_required';
  }});
  await login(page, 'trips?view=riding&when=history');
  await context.clearCookies();
  await page.reload();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).waitFor();
  assert.match(await page.locator('#account-status').innerText(), /session ended/i);
  await page.reload();
  await guest(page);
  assert.deepEqual(prompts, [null, 'none']);
  await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
  await signed(page);
  assert.equal(new URL(page.url()).hash, '#/trips?view=riding&when=history');
});

test('a temporary outage keeps the session recoverable, while an authenticated 401 removes private UI', async t => {
  const prompts = [];
  const {context, page} = await openStudio(t, {onAuthorize:params => { prompts.push(params.get('prompt')); }});
  await login(page, 'circles');
  await context.route('**/v1/studio-session', r => r.fulfill({status:503, json:{}}));
  await page.reload();
  await page.locator('#account-status').filter({hasText:/Refresh to try again/}).waitFor();
  await context.unroute('**/v1/studio-session');
  await page.reload();
  await signed(page);
  await page.getByLabel('Circle name').waitFor();
  await page.route('**/v1/circles', r => r.fulfill({status:401, json:{detail:'Session ended'}}));
  await page.reload();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).waitFor();
  await page.locator('[data-status]').filter({hasText:/session ended/i}).waitFor();
  await guest(page);
  assert.equal(await page.getByLabel('Circle name').count(), 0);
  await page.reload();
  await guest(page);
  assert.deepEqual(prompts, [null]);
});

test('provider account changes and late callbacks cannot restore a signed-out account', async t => {
  let issued = tokens.rider;
  const {context, page} = await openStudio(t, {issueToken:() => issued});
  await login(page, 'circles');
  issued = tokens.driver;
  await context.clearCookies();
  await page.reload();
  await page.locator('#account-status').filter({hasText:/changed accounts/}).waitFor();
  await guest(page);
  await page.reload();
  await guest(page);
  await page.goto(base + '/studio/?code=already-used&state=stale');
  await page.locator('#account-status').filter({hasText:/could not be confirmed/}).waitFor();
  await guest(page);
  assert.equal(await page.getByLabel('Circle name').count(), 0);
});

test('a reload during the first code exchange uses a fresh authorization code', async t => {
  let notifyStarted, release;
  const started = new Promise(resolve => { notifyStarted = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  const prompts = [];
  let issued = 0;
  const {page} = await openStudio(t, {
    allowInterruptedExchange:true, onAuthorize:params => { prompts.push(params.get('prompt')); },
    issueToken:async () => { if (++issued === 1) { notifyStarted(); await delayed; } return tokens.rider; }
  });
  await page.goto(base + '/studio/#/circles');
  await account(page).click();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
  await started;
  try {
    await page.reload();
    await signed(page);
    await page.getByLabel('Circle name').waitFor();
    assert.deepEqual(prompts, [null, 'none']);
    assert.equal(issued, 2);
  } finally { release(); }
});

test('a public tracking link stays out of session recovery and browser storage', async t => {
  const {context, page} = await openStudio(t);
  await login(page, 'circles');
  let restores = 0;
  await context.route('**/v1/studio-session', r => { restores++; return r.continue(); });
  const token = 'synthetic-private-viewer-link';
  await page.goto(base + '/studio/?open=viewer#/track/' + token);
  await page.getByRole('heading', {name:'Follow a trip'}).waitFor();
  assert.equal(restores, 0);
  assert.equal(await page.evaluate(value => JSON.stringify([localStorage, sessionStorage]).includes(value), token), false);
  await page.getByRole('navigation').getByRole('link', {name:'My Circles'}).click();
  await signed(page);
  await page.getByLabel('Circle name').waitFor();
});

test('signing out elsewhere while renewal is in flight takes precedence over its callback', async t => {
  let started, release, count = 0;
  const waiting = new Promise(resolve => { started = resolve; });
  const delayed = new Promise(resolve => { release = resolve; });
  const {context, page} = await openStudio(t, {
    allowInterruptedExchange:true,
    issueToken:async () => {
      if (++count === 2) { started(); await delayed; }
      return tokens.rider;
    }
  });
  await login(page, 'circles');
  await context.clearCookies();
  const other = await context.newPage();
  await other.goto(base + '/studio/#/circles', {waitUntil:'commit'});
  await waiting;
  try {
    await account(page).click();
    await guest(page);
  } finally { release(); }
  await guest(other);
  await other.reload();
  await guest(other);
  assert.equal(await other.getByLabel('Circle name').count(), 0);
});

test('a previous API with no session-cache capability resumes without requesting staff access', async t => {
  const prompts = [];
  const {context, page} = await openStudio(t, {onAuthorize:params => { prompts.push(params.get('prompt')); }});
  await context.route('**/v1/studio-config', async route => {
    const config = await (await route.fetch()).json();
    delete config.studio_session_cache;
    await route.fulfill({json:config});
  });
  let cacheCalls = 0;
  await context.route('**/v1/studio-session', r => { cacheCalls++; return r.abort(); });
  await login(page, 'circles');
  await page.reload();
  await signed(page);
  await page.getByLabel('Circle name').waitFor();
  assert.deepEqual(prompts, [null, 'none']);
  assert.equal(cacheCalls, 0);
});

test('an in-use token can expire without replaying the action that received 401', async t => {
  const prompts = [];
  let issues = 0, writes = 0;
  const shortToken = tokens['session-rider'];
  const {context, page} = await openStudio(t, {
    role:'session-rider',
    onAuthorize:params => { prompts.push(params.get('prompt')); },
    issueToken:() => ++issues === 1 ? shortToken : tokens['session-renewed']
  });
  await login(page, 'circles');
  await page.getByLabel('Circle name').fill('Do not repeat this request');
  const {exp} = JSON.parse(Buffer.from(shortToken.split('.')[1], 'base64url').toString());
  await page.clock.setFixedTime(new Date(exp * 1000 + 1000));
  await context.clearCookies();
  await page.route('**/v1/circles', route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++;
    return route.fulfill({status:401, json:{detail:'Expired access token'}});
  });
  const loadedWithNewToken = page.waitForResponse(response =>
    response.url() === base + '/v1/circles' && response.request().method() === 'GET' &&
    response.request().headers().authorization === 'Bearer ' + tokens['session-renewed'] && response.ok());
  await page.getByRole('button', {name:'Create circle', exact:true}).click();
  await loadedWithNewToken;
  await signed(page);
  await page.getByLabel('Circle name').waitFor();
  assert.equal(await page.getByLabel('Circle name').inputValue(), '');
  assert.deepEqual(prompts, [null, 'none']);
  assert.equal(writes, 1);
});

test('fully blocked site storage leaves public planning available and explains sign-in', async t => {
  const {context, page} = await openStudio(t);
  await context.addInitScript(() => {
    for (const key of ['localStorage','sessionStorage']) {
      Object.defineProperty(window, key, {get(){ throw new DOMException('Storage is blocked', 'SecurityError'); }});
    }
  });
  await page.goto(base + '/studio/#/book');
  await page.getByRole('combobox', {name:'Pickup', exact:true}).waitFor();
  await account(page).click();
  await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
  await page.locator('#account-status').filter({hasText:'Allow site storage in this browser to sign in.'}).waitFor();
});

test('a sign-in begun on the previous release resumes after a frontend upgrade', async t => {
  const prompts = [];
  const {page} = await openStudio(t, {onAuthorize:params => { prompts.push(params.get('prompt')); }});
  await page.goto(base + '/studio/#/book');
  await guest(page);
  await page.evaluate(origin => {
    sessionStorage.setItem('cc-pkce', JSON.stringify({
      state:'x'.repeat(43), verifier:'v'.repeat(43), apiOrigin:origin, route:'#/circles'
    }));
  }, base);
  await page.goto(base + '/studio/?code=from-old-client&state=' + 'x'.repeat(43));
  await signed(page);
  await page.getByLabel('Circle name').waitFor();
  assert.deepEqual(prompts, ['none']);
  assert.equal(await page.evaluate(() => sessionStorage.getItem('cc-pkce')), null);
});
