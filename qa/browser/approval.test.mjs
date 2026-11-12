import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base = 'http://127.0.0.1:8765';
const tokens = JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES, 'utf8'));
const navigate = (page, path) => page.evaluate(path => { location.hash='/'+path; }, path);

test('an older API keeps instant checkout offers usable and explains V2-only screens', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args:['--no-sandbox']
  });
  try {
    const context = await browser.newContext();
    await offlineLogin(context, base, 'approval-rider', tokens['approval-rider']);
    await context.route('**/v1/studio-config', async route => {
      const upstream = await route.fetch();
      const config = await upstream.json();
      delete config.journey_approvals;
      await route.fulfill({json:config});
    });
    const page = await context.newPage();
    await page.goto(base+'/studio/#/circles');
    await page.locator('#account button').click();
    await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
    await page.getByRole('heading',{name:'This feature needs the V2 service'}).waitFor();
    await navigate(page,'offer');
    await page.getByLabel('Meeting place',{exact:true}).first().fill('Library entrance');
    await page.getByLabel('Meeting place',{exact:true}).last().fill('Town station');
    await page.getByLabel('Departure · local time').fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
    await page.getByLabel('km from start').last().fill('5');
    await page.getByLabel('min from start').last().fill('10');
    await page.getByLabel('Full-route fare').fill('25');
    assert.equal(await page.getByLabel('Booking mode').count(),0);
    await page.getByLabel('I have checked the public stops').check();
    await page.getByRole('button',{name:'Review ride'}).click();
    const sent = page.waitForRequest(r=>r.url()===base+'/v1/journeys' && r.method()==='POST');
    await page.route('**/v1/journeys',r=>r.fulfill({status:201,json:{}}));
    await page.getByRole('button',{name:'Publish ride'}).click();
    const payload=(await sent).postDataJSON();
    assert.equal(payload.price_paise,2500);
    for(const key of ['booking_mode','circle_id','vehicle_id']) assert.ok(!(key in payload));
  } finally {
    await browser.close();
  }
});

test('reviewer approves driver → private circle offer → request, checkout, boarding and safety review', {
  timeout: 130000
}, async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args:['--no-sandbox']
  });
  const errors = [];
  async function signIn(role, path) {
    const context = await browser.newContext({viewport:{width:360,height:800}, timezoneId:'UTC'});
    await offlineLogin(context, base, role, tokens[role]);
    await context.route('https://tiles.openfreemap.org/**', r=>r.abort());
    await context.route('https://photon.komoot.io/**', r=>r.fulfill({json:{features:[]}}));
    await context.route('https://router.project-osrm.org/**', r=>r.abort());
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', e=>errors.push(e.message));
    await page.goto(base+'/studio/#/'+path);
    await page.locator('#account button').click();
    await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
    return page;
  }
  try {
    const driver = await signIn('approval-driver','verification');
    const navRows = await driver.locator('.primary-nav a').evaluateAll(links =>
      new Set(links.map(link=>Math.round(link.getBoundingClientRect().top))).size);
    assert.equal(navRows,1);
    await driver.getByLabel('Secure verification case reference').fill('browser-case-001');
    await driver.getByRole('button',{name:'Submit for review'}).click();
    await driver.locator('[data-driver]').getByText('pending',{exact:true}).waitFor();
    for (const [field,value] of [['Make','Honda'],['Model','City'],['Colour','Blue'],['Registration','TEST-CC-001']]) {
      await driver.getByLabel(field,{exact:true}).fill(value);
    }
    await driver.getByRole('button',{name:'Submit vehicle'}).click();
    await driver.getByText('Honda City',{exact:true}).waitFor();

    const reviewer = await signIn('reviewer','staff');
    for (const decision of ['[data-driver="ci-approval-driver"]','[data-vehicle]']) {
      const button = reviewer.locator(decision+'[data-decision="approved"]');
      await button.click();
      await reviewer.getByRole('dialog').getByRole('button',{name:'Confirm decision'}).click();
      await button.waitFor({state:'detached'});
    }
    await navigate(driver,'circles');
    await driver.getByLabel('Circle name').fill('Browser approval circle');
    await driver.getByRole('button',{name:'Create circle'}).click();
    await driver.getByRole('button',{name:'Create invitation'}).click();
    await driver.locator('[data-token-panel]').waitFor();
    const invitation = await driver.locator('[data-token]').innerText();

    const rider = await signIn('approval-rider','circles');
    await rider.getByLabel('Invitation token').fill(invitation);
    await rider.getByRole('button',{name:'Join circle'}).click();
    await rider.getByRole('button',{name:'Browse journeys'}).waitFor();

    await navigate(driver,'offer');
    await driver.getByLabel('Meeting place',{exact:true}).first().fill('Market square');
    await driver.getByLabel('Meeting place',{exact:true}).last().fill('Bus depot');
    await driver.getByLabel('km from start',{exact:true}).last().fill('10');
    await driver.getByLabel('min from start',{exact:true}).last().fill('20');
    await driver.getByLabel('Departure · local time').fill(new Date(Date.now()+15*60000).toISOString().slice(0,16));
    await driver.getByLabel('Full-route fare').fill('120');
    await driver.getByLabel('Booking mode').selectOption('approval');
    await driver.getByLabel('Approved vehicle').selectOption({label:'Honda City'});
    assert.equal(await driver.getByLabel('Seats offered').locator('option[value="8"]').count(),0);
    await driver.getByLabel('Audience').selectOption({label:'Browser approval circle (private)'});
    await driver.getByLabel('I have checked the public stops').check();
    await driver.getByRole('button',{name:'Review ride'}).click();
    await driver.getByText('Booking: Driver approval · Private circle').waitFor();
    await driver.getByRole('button',{name:'Publish ride'}).click();
    await driver.getByRole('link',{name:'View itinerary'}).waitFor();

    await rider.getByRole('button',{name:'Browse journeys'}).click();
    await rider.locator('[data-journeys] a').click();
    await rider.getByLabel('I agree to the shown fare').check();
    await rider.getByRole('button',{name:'Request driver approval'}).click();
    await rider.getByRole('heading',{name:'Waiting for driver approval'}).waitFor();
    await driver.getByRole('button',{name:'Refresh trips'}).click();
    await driver.getByRole('button',{name:'Approve',exact:true}).click();
    await rider.getByRole('button',{name:/Pay.*in sandbox/}).click({timeout:25000});
    await rider.getByRole('button',{name:'Show boarding PIN'}).click();
    await rider.locator('[data-pin-output]').getByText(/one-time PIN/).waitFor();
    const pin = (await rider.locator('[data-pin-output]').innerText()).match(/\b[0-9]{6}\b/)[0];
    await driver.getByRole('button',{name:'Refresh trips'}).click();
    await driver.locator('.passengers summary').click();
    await driver.getByLabel('Passenger boarding PIN').fill(pin);
    await driver.getByRole('button',{name:'Confirm boarding'}).click();
    await rider.getByRole('heading',{name:'Boarded',exact:true}).waitFor({timeout:25000});
    assert.equal(await rider.getByRole('button',{name:'Cancel reservation'}).count(),0);
    assert.equal(await rider.getByRole('button',{name:'Confirm trip complete'}).count(),0);
    await rider.getByRole('link',{name:'Report a safety concern'}).click();
    await rider.getByLabel('What happened?').fill('Synthetic browser test of the review queue.');
    await rider.getByRole('button',{name:'Submit confidential report'}).click();
    await rider.getByText('Synthetic browser test of the review queue.').waitFor();
    await navigate(reviewer,'profile');
    await reviewer.getByRole('heading',{name:'My profile',exact:true}).waitFor();
    await navigate(reviewer,'staff');
    const report=reviewer.locator('article').filter({hasText:'Synthetic browser test of the review queue.'});
    await report.getByLabel('Case status').selectOption('resolved');
    await report.getByLabel('Internal case note').fill('Reviewed the synthetic test report.');
    await report.getByRole('button',{name:'Record review'}).click();
    await report.waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
  } finally {
    await browser.close();
  }
});
