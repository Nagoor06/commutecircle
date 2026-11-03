import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHash
} from 'node:crypto';
import {
  readFile,
  mkdir
} from 'node:fs/promises';
import {
  chromium
} from 'playwright-core';
const base = 'http://127.0.0.1:8765';
const signed = JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES, 'utf8'));

test('driver offer → debounced passenger matches → segment checkout → driver refund', {
  timeout: 115000
}, async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    args: ['--no-sandbox']
  });
  const errors = [];
  async function visit(role, mobile = false, beforeLogin) {
    const context = await browser.newContext({
      viewport: mobile ? {
        width: 390,
        height: 844
      } : {
        width: 1280,
        height: 850
      },
      isMobile: mobile,
      hasTouch: mobile,
      locale: 'en-IN',
      timezoneId: 'Asia/Kolkata'
    });
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
          access_token: signed[role]
        })
      });
    });
    // The app and PostgreSQL are real. External basemap and geocoder availability are not CI prerequisites.
    await context.route('https://tiles.openfreemap.org/**', r => r.abort());
    await context.route('https://router.project-osrm.org/**', r => r.abort());
    await context.route('https://photon.komoot.io/**', r => r.fulfill({
      json: {
        features: []
      }
    }));
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/studio/#/' + (role === 'driver' ? 'offer' : 'book'));
    if (beforeLogin) await beforeLogin(page);
    await page.getByRole('button', {
      name: 'Sign in',
      exact: true
    }).first().click();
    await page.getByRole('button', {
      name: 'Sign out',
      exact: true
    }).waitFor();
    return page;
  }
  try {
    const driver = await visit('driver');
    await driver.getByRole('button', {
      name: 'Add an intermediate stop'
    }).click();
    await driver.getByLabel('Meeting place', {
      exact: true
    }).nth(1).fill('Mangalagiri');
    for (const [name, values] of [
        ['km from start', ['20', '40']],
        ['min from start', ['30', '60']]
      ]) {
      await driver.getByLabel(name, {
        exact: true
      }).nth(1).fill(values[0]);
      await driver.getByLabel(name, {
        exact: true
      }).nth(2).fill(values[1]);
    }
    await driver.getByLabel('Full-route fare').fill('200');
    await driver.getByLabel('Include my vehicle').check();
    for (const [name, value] of [
        ['Make', 'Honda'],
        ['Model', 'City'],
        ['Colour', 'Silver'],
        ['Date purchased', '2022-06-12']
      ]) await driver.getByLabel(name, {
      exact: true
    }).fill(value);
    await driver.getByRole('button', {
      name: 'Review ride'
    }).click();
    await driver.getByRole('heading', {
      name: 'Review your ride'
    }).waitFor();
    await driver.getByRole('button', {
      name: 'Publish ride'
    }).click();
    await driver.getByRole('heading', {
      name: 'My trips'
    }).waitFor();
    await driver.getByRole('link', {
      name: 'View itinerary'
    }).first().waitFor();

    const rider = await visit('rider', true, async page => {
      const drop = page.getByRole('combobox', {name: 'Drop-off', exact: true});
      await drop.fill('Mangal');
      await page.getByRole('option', {name: /Mangalagiri/}).first().click();
      await page.reload();
      assert.equal(await drop.inputValue(), 'Mangalagiri');
    });
    const pickup = rider.getByRole('combobox', {
        name: /pickup/i
      }),
      drop = rider.getByRole('combobox', {
        name: /drop-off/i
      });
    assert.equal(await drop.inputValue(), 'Mangalagiri', 'the chosen drop-off survives sign-in');
    await pickup.fill('Tenal');
    await rider.getByRole('option', {
      name: /Tenali Junction/
    }).first().click();
    await drop.fill('Mangal');
    await rider.getByRole('option', {
      name: /Mangalagiri/
    }).first().click();
    const match = rider.locator('[data-matches] a').filter({
      hasText: 'Mangalagiri'
    }).first();
    await match.waitFor();
    assert.match(await match.textContent(), /₹100/);
    assert.ok(await rider.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      'mobile layout overflows');
    await mkdir('evidence', {
      recursive: true
    });
    await rider.screenshot({
      path: 'evidence/mobile-book.png',
      fullPage: true
    });
    await match.click();
    await rider.getByRole('heading', {
      name: 'Honda City'
    }).waitFor();
    await rider.getByRole('button', {
      name: 'Hold one seat'
    }).click();
    await rider.getByRole('heading', {
      name: 'Review your booking'
    }).waitFor();
    await rider.getByRole('button', {
      name: 'Pay ₹100 in sandbox'
    }).click();
    await rider.getByRole('heading', {
      name: 'Booked',
      exact: true
    }).waitFor();
    await rider.getByRole('navigation', {name: 'Main navigation'}).getByRole('link', {
      name: 'My trips',
      exact: true
    }).click();
    await rider.getByRole('link', {
      name: 'View receipt'
    }).waitFor();
    await driver.getByRole('button', {
      name: 'Refresh trips'
    }).click();
    await driver.getByText('Passenger reservations (1)').first().waitFor();
    await driver.getByRole('button', {
      name: 'Cancel ride',
      exact: true
    }).first().click();
    await driver.getByRole('dialog').getByRole('button', {
      name: 'Cancel ride',
      exact: true
    }).click();
    await driver.getByText('No current offers').waitFor();
    await rider.getByRole('link', {
      name: 'History',
      exact: true
    }).click();
    await rider.getByText('Driver cancelled', {
      exact: true
    }).waitFor();
    assert.match(await rider.locator('.trip-list').innerText(), /Refund ₹100/);
    await rider.screenshot({
      path: 'evidence/mobile-refund.png',
      fullPage: true
    });
    await rider.getByRole('link', {
      name: 'Help',
      exact: true
    }).click();
    await rider.goBack();
    await rider.getByRole('heading', {
      name: 'My trips'
    }).waitFor();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close()
  }
});

test('guest navigation never invents rides; stop hints work when external lookup fails', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
    headless: true,
    args: ['--no-sandbox']
  });
  try {
    const page = await browser.newPage({
      viewport: {
        width: 360,
        height: 800
      }
    });
    page.setDefaultTimeout(8000);
    await page.route(/^https:/, r => r.abort());
    await page.goto(base + '/commutecircle/#/book');
    await page.getByRole('combobox', {
      name: /pickup/i
    }).fill('Hyder');
    await page.getByRole('option', {
      name: /Hyderabad Deccan/i
    }).waitFor();
    await page.getByRole('combobox', {
      name: /pickup/i
    }).press('Escape');
    assert.equal(await page.locator('[aria-label="Route map"]').count(), 1);
    await page.getByRole('link', {
      name: 'My trips',
      exact: true
    }).click();
    await page.getByRole('heading', {
      name: 'Bookings unavailable'
    }).waitFor();
    await page.getByRole('link', {
      name: 'Offer a ride',
      exact: true
    }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.equal(await page.getByRole('button', {
      name: 'Pay',
      exact: false
    }).count(), 0);
    let configRequests = 0;
    await page.route('**/v1/studio-config', route => {
      configRequests++;
      return route.fulfill({status: 503, body: ''});
    });
    await page.goto(base + '/studio/#/book');
    await page.getByRole('combobox', {name: 'Pickup', exact: true}).waitFor();
    assert.equal(configRequests, 0, 'route planning is independent of the booking service');
    await page.getByRole('button', {name: 'Sign in', exact: true}).first().click();
    await page.getByText('Could not reach the booking service. Try signing in again.').waitFor();
    assert.equal(configRequests, 1);
  } finally {
    await browser.close()
  }
});
