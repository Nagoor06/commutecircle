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
  timeout: 155000
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
    await context.addInitScript(() => {
      const fix=()=>({coords:{latitude:16.3,longitude:80.6,accuracy:12},timestamp:Date.now()});
      Object.defineProperty(navigator,'geolocation',{value:{
        watchPosition:success=>{window.sendTestFix=success;return setTimeout(()=>success(fix()),20);},
        getCurrentPosition:success=>setTimeout(()=>success(fix()),20),
        clearWatch:id=>clearTimeout(id)
      }});
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
    await page.getByRole('button', {name: /Continue to secure sign-in/}).click();
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
    await driver.getByLabel('I have checked the public stops').check();
    const departure=await driver.evaluate(()=>{
      const d=new Date(Date.now()+30*60*1000);
      const part=n=>String(n).padStart(2,'0');
      return `${d.getFullYear()}-${part(d.getMonth()+1)}-${part(d.getDate())}T${part(d.getHours())}:${part(d.getMinutes())}`;
    });
    await driver.getByLabel('Departure · local time').fill(departure);
    const travelDate=(await driver.getByLabel('Departure · local time').inputValue()).slice(0,10);
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
      await page.getByLabel('Travel date', {exact:true}).fill(travelDate);
      await page.reload();
      assert.equal(await drop.inputValue(), 'Mangalagiri');
      await page.locator('[data-matches] a').filter({hasText:'Mangalagiri'}).first().waitFor();
      let unavailable=true;
      await page.route('**/v1/journeys/search',route=>{
        if(unavailable){unavailable=false;return route.fulfill({status:503,json:{detail:'Temporarily unavailable'}});}
        return route.continue();
      });
      await page.getByRole('button',{name:'View matching rides',exact:true}).click();
      await page.getByText('The ride service may be waking up. Retrying automatically (1/2)…',{exact:true}).waitFor();
      await page.locator('.result-list').getByText('₹100',{exact:false}).first().waitFor();
      await page.unroute('**/v1/journeys/search');
      await page.getByRole('link',{name:'Edit search',exact:true}).click();
      await page.getByLabel('Travel date',{exact:true}).fill('2099-01-01');
      await page.getByRole('button',{name:'View matching rides',exact:true}).click();
      await page.getByRole('heading',{name:'No rides for this search',exact:true}).waitFor();
      await page.getByRole('button',{name:'Show all routes',exact:true}).click();
      await page.getByText('Rides on your selected date',{exact:true}).waitFor();
      await page.getByRole('heading',{name:'No rides for this search',exact:true}).waitFor();
      await page.getByRole('link',{name:'Edit search',exact:true}).click();
      await page.getByLabel('Travel date',{exact:true}).fill(travelDate);
      await page.locator('[data-matches] a').filter({hasText:'Mangalagiri'}).first().waitFor();
    });
    await rider.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Profile',exact:true}).click();
    await rider.getByRole('heading',{name:'My profile',exact:true}).waitFor();
    await rider.getByLabel('Contact name',{exact:true}).fill('Trusted person');
    await rider.getByRole('button',{name:'Save favourite',exact:true}).click();
    await rider.locator('.contact-row').getByText('Trusted person',{exact:true}).waitFor();
    await rider.getByLabel('Where do you work?',{exact:false}).fill('CI private office');
    await rider.getByRole('combobox',{name:'Public pickup point',exact:true}).fill('Tenal');
    await rider.getByRole('option',{name:/Tenali Junction/}).first().click();
    await rider.getByRole('combobox',{name:'Office-area meeting point',exact:true}).fill('Mangal');
    await rider.getByRole('option',{name:/Mangalagiri/}).first().click();
    await rider.getByLabel('These are public meeting points').check();
    await rider.getByRole('button',{name:'Save my commute',exact:true}).click();
    await rider.getByRole('heading',{name:'Book a ride',exact:true}).waitFor();
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
    const receiptUrl=rider.url();
    await rider.getByRole('link',{name:'Track vehicle',exact:true}).click();
    await rider.getByText('The driver is not sharing vehicle location with passengers yet.',{exact:true}).waitFor();
    await driver.getByRole('link',{name:'Share my trip',exact:true}).first().click();
    await driver.getByLabel('I want to share my live GPS location').check();
    await driver.getByLabel('Also let my confirmed passengers track').check();
    await driver.getByRole('button',{name:'Start location sharing',exact:true}).click();
    await driver.locator('main [data-state]').filter({hasText:'Location sharing is on'}).waitFor();
    await rider.getByRole('button',{name:'Refresh location',exact:true}).click();
    await rider.getByText('Live location · driver GPS',{exact:true}).waitFor();
    await rider.getByRole('button',{name:'Show live map',exact:true}).click();
    await rider.locator('.vehicle-marker').waitFor();
    assert.equal(await rider.locator('.traveller-marker').count(),0);
    // Pan while following is off so a changed marker cannot be hidden by map recentering.
    const canvas=rider.locator('[data-live-canvas]'), bounds=await canvas.boundingBox();
    await rider.mouse.move(bounds.x+120,bounds.y+150);await rider.mouse.down();
    await rider.mouse.move(bounds.x+160,bounds.y+180,{steps:8});await rider.mouse.up();
    await rider.getByRole('button',{name:'Follow location',exact:true}).waitFor();
    const initialPosition=await rider.locator('.live-position').getAttribute('style');
    // Throttle is real; wait for the next allowed fix without changing app clocks.
    await driver.waitForTimeout(5100);
    const moved=driver.waitForResponse(r=>r.url().endsWith('/location')&&r.request().method()==='PUT');
    await driver.evaluate(()=>window.sendTestFix({coords:{latitude:16.301,longitude:80.602,accuracy:18},timestamp:Date.now()}));
    assert.equal((await moved).status(),200);
    await rider.getByRole('button',{name:'Refresh location',exact:true}).click();
    await rider.waitForFunction(previous=>document.querySelector('.live-position')?.getAttribute('style')!==previous,initialPosition);
    assert.match(await rider.locator('[data-external]').getAttribute('href'),/16.301/);
    assert.ok(await rider.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'live map overflows mobile');
    await rider.screenshot({path:'evidence/mobile-live-vehicle.png',fullPage:true});
    await driver.locator('#sharing-status').getByRole('button',{name:'Stop sharing',exact:true}).click();
    await rider.getByRole('button',{name:'Refresh location',exact:true}).click();
    await rider.getByText('The driver is not sharing vehicle location with passengers yet.',{exact:true}).waitFor();
    assert.equal(await rider.locator('.vehicle-marker').count(),0,'revocation removes the vehicle and coordinates');
    assert.equal(await rider.locator('[data-external]').getAttribute('href'),null);
    await rider.evaluate(url=>{location.hash=new URL(url).hash;},receiptUrl);

    await rider.getByRole('link',{name:'Share my trip',exact:true}).click();
    await rider.getByRole('button',{name:'Start location sharing',exact:true}).click();
    await rider.getByText('Confirm who can see your location before starting.',{exact:true}).waitFor();
    await rider.getByLabel('I want to share my live GPS location').check();
    await rider.getByRole('button',{name:'Start location sharing',exact:true}).click();
    await rider.locator('main [data-state]').filter({hasText:'Location sharing is on'}).waitFor();
    await rider.getByRole('button',{name:'Share with Trusted person',exact:true}).waitFor();
    assert.ok(await rider.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    const firstLink=await rider.getByLabel('Private trip link',{exact:true}).inputValue();
    const viewerContext=await browser.newContext();
    const viewer=await viewerContext.newPage();
    await viewerContext.route('https://tiles.openfreemap.org/**',r=>r.abort());
    await viewer.goto(firstLink);
    await viewer.getByRole('link',{name:'Open last known location on OpenStreetMap',exact:true}).waitFor();
    assert.ok(!(await viewer.locator('main').innerText()).includes('CI private office'));
    await viewer.getByRole('button',{name:'Show live map',exact:true}).click();
    await viewer.locator('.traveller-marker').waitFor();
    assert.equal(await viewer.locator('.vehicle-marker').count(),0,'a rider position must never impersonate the vehicle');
    await rider.locator('#sharing-status').getByRole('button',{name:'Stop sharing',exact:true}).click();
    await rider.locator('main [data-state]').getByText('Sharing is off.',{exact:true}).waitFor();
    await viewer.getByRole('button',{name:'Refresh location',exact:true}).click();
    await viewer.getByText('This sharing link has ended. Ask your traveller for a new link.',{exact:true}).waitFor();
    await rider.getByRole('button',{name:'Start location sharing',exact:true}).click();
    await rider.locator('main [data-state]').filter({hasText:'Location sharing is on'}).waitFor();
    const secondLink=await rider.getByLabel('Private trip link',{exact:true}).inputValue();
    assert.notEqual(firstLink,secondLink);
    await viewer.goto(secondLink);
    await viewer.getByRole('link',{name:'Open last known location on OpenStreetMap',exact:true}).waitFor();
    // Hash navigation keeps explicit sharing active; a full reload deliberately ends it.
    await rider.evaluate(url=>{location.hash=new URL(url).hash;},receiptUrl);
    await rider.getByRole('link', {name:'Message driver',exact:true}).click();
    await rider.getByLabel('Message', {exact:true}).fill('Call 9876543210');
    await rider.getByRole('button', {name:'Send message',exact:true}).click();
    await rider.getByText(/Phone numbers, emails, contact handles and links are not allowed/).waitFor();
    await rider.getByLabel('Message', {exact:true}).fill('I’m at the pickup point.');
    await rider.getByRole('button', {name:'Send message',exact:true}).click();
    await rider.locator('.message').getByText('I’m at the pickup point.',{exact:true}).waitFor();
    await rider.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Messages',exact:true}).click();
    await rider.locator('.conversation').filter({hasText:'I’m at the pickup point.'}).waitFor();
    assert.ok(await rider.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile inbox overflows');
    await driver.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Messages',exact:true}).click();
    await driver.getByRole('link',{name:'Unread',exact:true}).click();
    await driver.locator('.conversation .unread-count').getByText('1',{exact:true}).waitFor();
    await driver.locator('.conversation').first().click();
    await driver.locator('.message').getByText('I’m at the pickup point.',{exact:true}).waitFor();
    await driver.getByLabel('Message',{exact:true}).fill('Meet by the public sign.');
    await driver.getByRole('button',{name:'Send message',exact:true}).click();
    await driver.locator('.message').getByText('Meet by the public sign.',{exact:true}).waitFor();
    await driver.getByRole('link',{name:'All messages',exact:true}).click();
    await driver.getByRole('link',{name:'Unread',exact:true}).click();
    await driver.getByRole('heading',{name:'You’re all caught up',exact:true}).waitFor();
    await driver.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'My trips',exact:true}).click();
    await driver.getByRole('link',{name:'Driving',exact:true}).click();
    await rider.getByRole('button',{name:'Refresh',exact:true}).click();
    await rider.locator('.conversation.unread').filter({hasText:'Meet by the public sign.'}).waitFor();
    await rider.screenshot({path:'evidence/mobile-messages.png',fullPage:true});
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
    await viewer.getByRole('button',{name:'Refresh location',exact:true}).click();
    await viewer.getByText('This sharing link has ended. Ask your traveller for a new link.',{exact:true}).waitFor();
    await viewerContext.close();
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
    await rider.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Messages',exact:true}).click();
    await rider.locator('.conversation').getByText('Read only',{exact:true}).waitFor();
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
    await page.getByRole('button',{name:'Search farther away',exact:true}).waitFor();
    assert.equal(await page.getByRole('option',{name:/Hyderabad Deccan/i}).count(),0);
    await page.getByRole('button',{name:'Search farther away',exact:true}).click();
    await page.getByRole('option',{name:/Hyderabad Deccan/i}).waitFor();
    await page.getByRole('combobox', {
      name: /pickup/i
    }).press('Escape');
    await page.locator('.search-filters summary').click();
    const checkbox=page.getByLabel('Air conditioning',{exact:true});
    const dimensions=await checkbox.boundingBox();
    assert.ok(dimensions.width<=22 && dimensions.height<=22,'AC checkbox must retain its control size');
    await checkbox.check();
    await page.locator('.search-filters summary').click();
    const lookups=[];
    await page.route('https://photon.komoot.io/**',async route=>{
      const url=new URL(route.request().url());lookups.push(url);
      const isReverse=url.pathname==='/reverse';
      return route.fulfill({json:{features:[{properties:{name:isReverse?'Station Road':'Local Bus Stop',city:'Tenali'},geometry:{type:'Point',coordinates:[Number(url.searchParams.get('lon'))+(isReverse ? 0.00001 : 0.01),Number(url.searchParams.get('lat'))+(isReverse ? 0.00001 : 0.01)]}}]}});
    });
    await page.locator('[aria-label="Move pickup pin"]').press('ArrowUp');
    await page.getByRole('combobox',{name:'Pickup',exact:true}).filter({visible:true}).waitFor();
    await page.waitForFunction(()=>document.querySelector('[aria-label="Pickup"]').value==='Station Road');
    assert.ok(!(await page.locator('.stop-label').allTextContents()).includes('Pickup pin'));
    await page.getByRole('combobox',{name:'Drop-off',exact:true}).fill('Local Bus');
    await page.getByRole('option',{name:/Local Bus Stop/}).waitFor();
    const forward=lookups.find(u=>u.pathname==='/api/'), reverse=lookups.find(u=>u.pathname==='/reverse');
    assert.ok(forward && reverse);
    assert.ok(Math.abs(Number(forward.searchParams.get('lat'))-Number(reverse.searchParams.get('lat')))<.0001);
    await page.getByRole('combobox',{name:'Drop-off',exact:true}).press('Escape');
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
    await page.getByRole('button', {name:/Continue to secure sign-in/}).click();
    await page.getByText('Could not reach the booking service. Try signing in again.').waitFor();
    assert.equal(configRequests, 1);
  } finally {
    await browser.close()
  }
});
