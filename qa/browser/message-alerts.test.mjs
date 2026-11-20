import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base='http://127.0.0.1:8765';
const tokens=JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES,'utf8'));
const jid='11111111-1111-4111-8111-111111111111',tid='22222222-2222-4222-8222-222222222222';
const message=(id,time)=>({message_id:id,journey_id:jid,ticket_id:tid,role:'passenger',created_at:time});

test('global message badges, mobile toast actions, read clearing and reload deduplication',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width:320,height:740},reducedMotion:'reduce'});
  await offlineLogin(context,base,'session-rider',tokens['session-rider']);
  const page=await context.newPage();page.setDefaultTimeout(12000);
  let data={unread:1,items:[message('old',new Date(Date.now()-60000).toISOString())]};
  await page.route('**/v1/me/conversations/summary',r=>r.fulfill({json:data}));
  await page.route('**/v1/me/conversations?*',r=>r.fulfill({json:{items:[],has_more:false}}));
  await page.route('**/v1/me/push',r=>r.fulfill({json:{available:false,public_key:''}}));
  await page.route(`**/v1/journeys/${jid}/tickets/${tid}/messages`,r=>r.fulfill({json:{role:'passenger',closed:false,messages:[]}}));
  await page.goto(base+'/studio/#/messages');
  await page.locator('#account button').click();
  await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  await page.waitForFunction(()=>document.querySelector('.inbox-badge')?.textContent==='1');
  assert.equal(await page.locator('.message-toast').count(),0,'Existing unread messages must not toast at login');
  data={unread:120,items:[message('new',new Date().toISOString()),...data.items]};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('.message-toast').waitFor();
  assert.equal(await page.locator('.inbox-badge').textContent(),'99+');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await mkdir(new URL('./evidence/',import.meta.url),{recursive:true});
  await page.screenshot({path:new URL('./evidence/mobile-message-alert.png',import.meta.url).pathname,fullPage:true});
  await page.getByRole('button',{name:'Dismiss message notification'}).click();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.reload();
  await page.waitForFunction(()=>document.querySelector('.inbox-badge')?.textContent==='99+');
  assert.equal(await page.locator('.message-toast').count(),0);
  data={unread:121,items:[message('newest',new Date(Date.now()+1000).toISOString()),...data.items]};
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await page.locator('.message-toast a').click();
  await page.waitForURL('**/#/chat/'+jid+'/'+tid);
  assert.equal(await page.locator('.message-toast').count(),0);
  data={unread:0,items:[]};
  await page.evaluate(()=>window.dispatchEvent(new Event('cc:messages-read')));
  await page.locator('.inbox-badge').waitFor({state:'hidden'});
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByRole('button',{name:'Sign in',exact:true}).waitFor();
  assert.equal(await page.locator('.inbox-badge').count(),0);
});

test('install manifest and worker assets stay inside the application scope',async t=>{
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});t.after(()=>browser.close());
  const page=await browser.newPage();await page.goto(base+'/studio/');
  const manifest=await (await page.request.get(base+'/studio/manifest.webmanifest')).json();
  assert.equal(manifest.start_url,'./#/book');assert.equal(manifest.scope,'./');
  for(const icon of manifest.icons)assert.equal((await page.request.get(base+'/studio/'+icon.src)).status(),200);
  const scope=await page.evaluate(async()=>{
    const reg=await navigator.serviceWorker.ready;return reg.scope;
  });
  assert.equal(scope,base+'/studio/');
  await page.context().setOffline(true);
  await page.reload();
  await page.getByRole('heading',{name:'You’re offline'}).waitFor();
  assert.match(await page.locator('body').innerText(),/booking has not been changed/);
});
