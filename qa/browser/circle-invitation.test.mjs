import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base = 'http://127.0.0.1:8765';

test('circle invitations fit small screens and copy the message or just the token', async t => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox']
  });
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 320, height: 740}});
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {origin: base});
  const identities = JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES, 'utf8'));
  await offlineLogin(context, base, 'session-rider', identities['session-rider']);
  const name = 'River Road ' + 'A'.repeat(69);
  const token = 't'.repeat(256);
  await context.route('**/v1/circles', route => route.fulfill({json: [{id: 'river', name, role: 'owner'}]}));
  await context.route('**/v1/circles/river/invitations', route => route.fulfill({
    status: 201, json: {token, expires_at: '2030-07-15T10:00:00Z', expires_in_seconds: 172800}
  }));
  const page = await context.newPage();
  await page.goto(base + '/studio/#/circles');
  await page.locator('#account button').click();
  await page.getByRole('button', {name: /Continue to secure sign-in/}).click();
  await page.getByRole('button', {name: 'Create invitation'}).click();
  const card = page.getByRole('region', {name: 'Circle invitation'});
  await card.getByText('This token can be used once and expires on', {exact: false}).waitFor();
  const tokenNode = card.locator('[data-token]');
  assert.equal(await tokenNode.textContent(), token);
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({width, height: 800});
    assert.ok(await page.getByRole('link', {name: 'My Circles', exact: true}).locator('svg').evaluate(svg =>
      svg.getBoundingClientRect().width > 0 && svg.getBBox().width > 0 && svg.getBBox().height > 0));
    assert.ok(await card.evaluate(el => {
      const box = el.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(el.querySelector('code'));
      return document.documentElement.scrollWidth <= innerWidth && box.left >= 0 && box.right <= innerWidth &&
        [...range.getClientRects(), ...el.querySelectorAll('button')].every(item => {
          const r = item.getBoundingClientRect ? item.getBoundingClientRect() : item;
          return r.left >= box.left && r.right <= box.right;
        });
    }), 'invitation overflows at ' + width + 'px');
  }
  const messageCopy = card.getByRole('button', {name: 'Copy invitation'});
  const tokenCopy = card.getByRole('button', {name: 'Copy token'});
  await messageCopy.click();
  await card.getByText('Invitation copied.', {exact: true}).waitFor();
  const message = await page.evaluate(() => navigator.clipboard.readText());
  for (const part of [name, base + '/studio/#/circles', 'Join with one-time token', token, 'expires on', '2030']) {
    assert.ok(message.includes(part));
  }
  assert.equal(await card.locator('[data-join-url]').getAttribute('href'), base + '/studio/#/circles');
  await tokenCopy.click();
  await card.getByText('Token copied.', {exact: true}).waitFor();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), token);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {configurable: true, value: undefined}));
  await tokenCopy.click();
  await card.getByText('Token selected.', {exact: false}).waitFor();
  assert.equal(await page.evaluate(() => getSelection().toString()), token);
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', {
    value: {writeText: () => Promise.reject(new Error('Denied'))}
  }));
  await messageCopy.click();
  await card.getByText('Invitation selected.', {exact: false}).waitFor();
  assert.ok((await page.evaluate(() => getSelection().toString())).includes(name));
  assert.ok(!page.url().includes(token));
});
