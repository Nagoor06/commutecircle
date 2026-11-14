import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base='http://127.0.0.1:8765';
const tokens=JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES,'utf8'));
async function signedPage(t,setup) {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('https://tiles.openfreemap.org/**',r=>r.abort());
  await context.route('https://router.project-osrm.org/**',r=>r.abort());
  await context.route('https://photon.komoot.io/**',r=>r.fulfill({json:{features:[]}}));
  await context.addInitScript(()=>Object.defineProperty(navigator,'geolocation',{value:undefined}));
  await offlineLogin(context,base,'session-rider',tokens['session-rider']);
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  await setup(page);
  await page.goto(base+'/studio/#/profile');
  await page.locator('#account button').click();
  await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await page.getByRole('button',{name:'Save my commute',exact:true}).waitFor();
  return page;
}

test('a delayed profile save cannot race deletion or overwrite a newer planner',async t=>{
  let release,started;
  const gate=new Promise(resolve=>{release=resolve;});
  const writing=new Promise(resolve=>{started=resolve;});
  const saved={pickup:{name:'Old pickup'},workplace:{name:'Old workplace'},employer:'Office'};
  const page=await signedPage(t,async page=>{
    await page.route('**/v1/me/commute',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:saved});
      assert.equal(route.request().method(),'PUT');
      started();await gate;
      return route.fulfill({json:route.request().postDataJSON()});
    });
    await page.route('**/v1/journeys/search',r=>r.fulfill({json:{items:[],more:false}}));
  });
  await page.getByRole('button',{name:'Save my commute',exact:true}).click();
  await writing;
  assert.equal(await page.getByRole('button',{name:'Delete saved commute',exact:true}).isEnabled(),false);
  await page.getByRole('link',{name:'Book a ride',exact:true}).click();
  await page.getByRole('combobox',{name:'Pickup',exact:true}).fill('New pickup');
  await page.getByRole('combobox',{name:'Drop-off',exact:true}).fill('New destination');
  await page.getByRole('link',{name:'Help',exact:true}).click();
  const finished=page.waitForResponse(r=>r.url().endsWith('/v1/me/commute')&&r.request().method()==='PUT');
  release();await finished;
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  assert.equal(new URL(page.url()).hash,'#/help');
  await page.getByRole('link',{name:'Book a ride',exact:true}).click();
  assert.equal(await page.getByRole('combobox',{name:'Pickup',exact:true}).inputValue(),'New pickup');
  assert.equal(await page.getByRole('combobox',{name:'Drop-off',exact:true}).inputValue(),'New destination');
});

test('failed profile saves retain input and unlock the controls for retry',async t=>{
  const page=await signedPage(t,async page=>{
    await page.route('**/v1/me/commute',route=>route.request().method()==='GET'?
      route.fulfill({json:null}):route.fulfill({status:503,json:{detail:'Please retry saving your commute.'}}));
  });
  await page.getByRole('combobox',{name:'Public pickup point',exact:true}).fill('Library');
  await page.getByRole('combobox',{name:'Office-area meeting point',exact:true}).fill('Central station');
  await page.getByLabel('These are public meeting points').check();
  await page.getByRole('button',{name:'Save my commute',exact:true}).click();
  await page.getByText('Please retry saving your commute.',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Save my commute',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('button',{name:'Delete saved commute',exact:true}).isEnabled(),true);
  assert.equal(await page.getByRole('combobox',{name:'Public pickup point',exact:true}).inputValue(),'Library');
});

test('main workspaces fit phone, tablet and desktop breakpoint boundaries', {timeout:150000},async t=>{
  const label='LongStationName'.repeat(5);
  const page=await signedPage(t,async page=>{
    await page.route('**/v1/me/commute',r=>r.fulfill({json:null}));
    await page.route('**/v1/journeys/mine?*',r=>r.fulfill({json:[]}));
    await page.route('**/v1/me/earlier-trips?*',r=>r.fulfill({json:[]}));
    await page.route('**/v1/journeys/search',r=>r.fulfill({json:{items:[],more:false}}));
    await page.route('**/v1/me/conversations?*',r=>r.fulfill({json:{items:[],has_more:false}}));
    await page.route('**/v1/circles',r=>r.fulfill({json:[{id:'test-circle',name:label,role:'owner'}]}));
    await page.route('**/v1/me/driver-eligibility',r=>r.fulfill({json:{driver_status:'unverified',vehicles:[]}}));
    await page.route('**/v1/recurring-rides',r=>r.fulfill({json:[{
      id:'test-template',stops:[{name:label},{name:label}],local_time:'08:00',weekdays:[0,1,2,3,4],starts_on:'2099-01-01',ends_on:'2099-01-31',active:true
    }]}));
  });
  const errors=[],overflows=[];page.on('pageerror',e=>errors.push(e.message));
  for(const [route,ready] of [['book','.planner-card'],['offer','[data-offer-form]'],['circles','.circle-row'],['recurring','[data-create]'],['trips','[data-trip-list]'],['messages','.inbox'],['profile','[data-profile]']]) {
    await page.evaluate(route=>{location.hash='/'+route;},route);
    await page.locator(ready==='[data-trip-list]'?'.trip-tools':ready).waitFor();
    for(const width of [320,360,390,540,720,721,768,950,1024,1150,1151,1280,1281,1440]) {
      await page.setViewportSize({width,height:844});
      await page.waitForFunction(w=>matchMedia('(width: '+w+'px)').matches,width);
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      // Chromium applies viewport emulation and responsive layout asynchronously.
      // Persistent overflow still fails; a pending resize frame is not a defect.
      await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth+1,null,{timeout:1500}).catch(()=>{});
      const overflow=await page.evaluate(()=>({viewport:innerWidth,page:document.documentElement.scrollWidth,
        offenders:[...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.width&&r.right>innerWidth+1&&!el.closest('.leaflet-container');}).slice(0,8).map(el=>({tag:el.tagName,id:el.id,cls:el.getAttribute('class'),right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width,font:getComputedStyle(el).fontSize,text:el.textContent.slice(0,80)}))}));
      if(overflow.page>width+1)overflows.push(`${route} at ${width}px: ${JSON.stringify(overflow)}`);
    }
  }
  assert.deepEqual(errors,[]);
  assert.deepEqual(overflows,[]);
});
