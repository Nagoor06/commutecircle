import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';

const base='http://127.0.0.1:8765';
const locationFix={latitude:11.016834,longitude:76.955834};
async function browserFor(t) {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  t.after(()=>browser.close());
  return browser;
}
const pickup=page=>page.getByRole('combobox',{name:'Pickup',exact:true});
const dropoff=page=>page.getByRole('combobox',{name:'Drop-off',exact:true});
const locate=page=>page.getByRole('button',{name:'Use current location',exact:true});

test('fresh and older planners detect the pickup, keep the destination empty, and show bookable route suggestions',async t=>{
  const context=await (await browserFor(t)).newContext({geolocation:locationFix,permissions:['geolocation'],viewport:{width:390,height:844}});
  await context.route(/^https:/,route=>route.abort());
  const requests=[];
  const queries=[];
  context.on('request',req=>requests.push(req.url()+' '+(req.postData()||'')));
  const ride={journey:{id:'live-ride',price_paise:8000,departure:new Date().toISOString(),stops:[
    {name:'Central bus stop',lat:11.02,lon:76.96,metres:0,minutes:0},
    {name:'Library stop',lat:11.05,lon:76.99,metres:12000,minutes:25}
  ]},board:0,alight:1};
  await context.route('**/v1/journeys/search',route=>{
    const q=route.request().postDataJSON();
    queries.push(q);
    return route.fulfill({json:{items:q.after?.startsWith('2098')?[]:[ride],more:false}});
  });
  await context.route('**/assets/stations/nearby.json',route=>route.fulfill({json:[['Nearby railway station',11.0201,76.9601]]}));
  await context.addInitScript(()=>{
    const key='cc:plan:/studio/';
    if(!sessionStorage.getItem(key)) sessionStorage.setItem(key,JSON.stringify({
      until:Date.now()+300000,route:[{name:'Tenali Junction',lat:16.24241,lon:80.64041},{name:'Vijayawada Bus Station',lat:16.5076,lon:80.6139}],
      date:'',query:{origin:{name:'Tenali Junction'},destination:{name:'Vijayawada Bus Station'}}
    }));
  });
  const page=await context.newPage();
  await page.goto(base+'/studio/#/book');
  await page.getByText('Approximate pickup area near Nearby railway station',{exact:true}).waitFor();
  assert.equal(await pickup(page).inputValue(),'Current location');
  assert.equal(await dropoff(page).inputValue(),'');
  assert.equal(await page.locator('[aria-label="Move drop-off pin"]').count(),0);
  await page.locator('[data-matches] button').filter({hasText:'Central bus stop → Library stop'}).click();
  assert.ok(queries.some(q=>q.origin?.lat===11.02 && q.origin?.lon===76.96 && !q.destination));
  assert.equal(await pickup(page).inputValue(),'Central bus stop');
  assert.equal(await dropoff(page).inputValue(),'Library stop');
  await page.reload();
  assert.equal(await pickup(page).inputValue(),'Central bus stop');
  assert.equal(await dropoff(page).inputValue(),'Library stop');
  await page.getByLabel('Travel date').fill('2098-03-15');
  await page.getByText('No available rides for these stops and day.',{exact:false}).waitFor();
  const storage=await page.evaluate(()=>JSON.stringify([localStorage,sessionStorage]));
  for(const coordinate of Object.values(locationFix)){
    assert.ok(!requests.join('\n').includes(String(coordinate)) && !storage.includes(String(coordinate)));
  }
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
});

test('location denial, retry, manual edits, and late callbacks leave the user in control',async t=>{
  const page=await (await browserFor(t)).newPage();
  await page.route(/^https:/,route=>route.abort());
  await page.addInitScript(()=>{
    window.gpsCalls=0;
    Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(ok,fail){
      window.gpsCalls++;
      window.answerLocation=ok;
      window.rejectLocation=code=>fail({code});
    }}});
  });
  await page.goto(base+'/studio/#/book');
  await page.waitForFunction(()=>window.gpsCalls===1);
  await page.evaluate(()=>window.rejectLocation(1));
  await page.getByText('Location access is off.',{exact:false}).waitFor();
  assert.equal(await pickup(page).inputValue(),'');
  assert.equal(await dropoff(page).inputValue(),'');
  await pickup(page).click();
  assert.equal(await page.getByRole('listbox',{name:'Pickup suggestions'}).getByRole('option').count(),0);
  await locate(page).click();
  await page.evaluate(()=>window.rejectLocation(3));
  await page.getByText('Location timed out.',{exact:false}).waitFor();
  await locate(page).click();
  await pickup(page).fill('My chosen meeting place');
  await page.evaluate(coords=>window.answerLocation({coords}),locationFix);
  assert.equal(await pickup(page).inputValue(),'My chosen meeting place');
  await pickup(page).press('Tab');
  await page.getByRole('link',{name:'Help',exact:true}).click();
  await page.getByRole('link',{name:'Book a ride',exact:true}).click();
  assert.equal(await pickup(page).inputValue(),'My chosen meeting place');
  assert.equal(await page.evaluate(()=>window.gpsCalls),3);
});

test('unavailable location keeps a fresh form blank and permits manual map selection',async t=>{
  const page=await (await browserFor(t)).newPage();
  await page.route(/^https:/,route=>route.abort());
  await page.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:undefined}));
  await page.goto(base+'/studio/#/book');
  await page.getByText('Location is unavailable on this device.',{exact:false}).waitFor();
  assert.equal(await pickup(page).inputValue(),'');
  assert.equal(await dropoff(page).inputValue(),'');
  assert.equal(await page.locator('.route-marker').count(),0);
  await page.locator('[data-canvas].leaflet-container').click({position:{x:150,y:150}});
  await page.locator('[aria-label="Move pickup pin"]').waitFor();
  assert.match(await pickup(page).inputValue(),/^-?\d+\.\d+, -?\d+\.\d+$/);
  assert.equal(await dropoff(page).inputValue(),'');
});

test('drivers can turn a detected pickup into a named boarding stop before publishing',async t=>{
  const context=await (await browserFor(t)).newContext({geolocation:locationFix,permissions:['geolocation'],timezoneId:'UTC'});
  await context.route(/^https:/,route=>route.abort());
  await context.route('**/assets/stations/nearby.json',route=>route.fulfill({json:[['Town station',11.0201,76.9601]]}));
  const page=await context.newPage();
  await page.goto(base+'/studio/#/offer');
  const places=page.getByRole('combobox',{name:'Meeting place',exact:true});
  const publicStop=page.getByRole('button',{name:'Use Town station',exact:true});
  await publicStop.waitFor();
  assert.equal(await places.first().inputValue(),'Current location');
  assert.equal(await places.last().inputValue(),'');
  const time=page.getByLabel('Departure · local time');
  assert.equal(await time.inputValue(),'');
  await places.last().fill('Office entrance');
  await time.fill(new Date(Date.now()+86400000).toISOString().slice(0,16));
  await page.getByLabel('km from start').last().fill('5');
  await page.getByLabel('min from start').last().fill('15');
  await page.getByLabel('Full-route fare').fill('40');
  await page.getByLabel('I have checked the public stops').check();
  await page.getByRole('button',{name:'Review ride'}).click();
  await page.getByText('Choose a named public meeting point before publishing.').waitFor();
  await publicStop.click();
  await places.first().fill('Temporary edit');
  await places.first().press('Escape');
  assert.equal(await places.first().inputValue(),'Town station');
  await page.getByRole('button',{name:'Review ride'}).click();
  await page.getByRole('heading',{name:'Review your ride'}).waitFor();
  await page.locator('.stop-list').getByText('Town station',{exact:true}).waitFor();
});
