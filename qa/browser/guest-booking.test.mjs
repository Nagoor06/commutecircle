import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base = 'http://127.0.0.1:8765';
const tokens = JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES, 'utf8'));

test('a mobile guest booking reaches the correct receipt, survives reload, and leaves a separate seat for the booker', async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({viewport: {width: 360, height: 800}});
    const offer = await context.request.post(base + '/v1/journeys', {
      headers: {Authorization: 'Bearer ' + tokens['guest-driver']},
      data: {
        stops: [{name:'River gate',minutes:0,metres:0},{name:'Union stop',minutes:25,metres:6000}],
        departure:new Date(Date.now()+172800000).toISOString(), capacity:2, price_paise:2400,
      },
    });
    assert.equal(offer.status(),201);
    const jid = (await offer.json()).id;
    await offlineLogin(context, base, 'guest-booker', tokens['guest-booker']);
    const page = await context.newPage();
    const ride = base + '/studio/#/ride/' + jid;
    await page.goto(ride);
    await page.locator('#account button').click();
    await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
    await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
    await page.goto(ride);
    await page.getByRole('radio',{name:'Someone else'}).check();
    const name = page.getByLabel('Traveller’s name');
    await name.fill('లక్ష్మి');
    const hold = page.getByRole('button',{name:'Hold one seat'});
    assert.ok(await hold.isDisabled());
    const permission = page.getByLabel('They asked me to book and share their name.');
    await permission.check();
    await name.fill('లక్ష్మి దేవి');
    assert.ok(!(await permission.isChecked()));
    await permission.check();
    await hold.click();
    await page.getByText('Booked for లక్ష్మి దేవి',{exact:true}).waitFor();
    await page.getByRole('button',{name:/Pay .* in sandbox/}).click();
    await page.getByRole('link',{name:'Message driver'}).waitFor();
    await page.getByText('Share pickup details',{exact:true}).click();
    const itinerary = await page.getByLabel('Message for your traveller').inputValue();
    assert.match(itinerary,/CommuteCircle ride for లక్ష్మి దేవి/);
    assert.match(itinerary,/Pickup: River gate/);
    assert.match(itinerary,/Drop-off: Union stop/);
    assert.ok(!itinerary.includes(jid) && !itinerary.includes('http') && !itinerary.includes('PIN'));
    await page.reload();
    await page.getByText('Booked for లక్ష్మి దేవి',{exact:true}).waitFor();
    await page.goto(ride);
    await page.getByRole('radio',{name:'Me',exact:true}).waitFor();
    assert.ok(await hold.isEnabled());
    await page.getByRole('radio',{name:'Someone else'}).check();
    await name.fill('లక్ష్మి దేవి');
    await page.getByRole('button',{name:'Open receipt'}).click();
    await page.getByText('Booked for లక్ష్మి దేవి',{exact:true}).waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  } finally {
    await browser.close();
  }
});
