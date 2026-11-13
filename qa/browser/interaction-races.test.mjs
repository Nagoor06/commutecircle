import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {chromium} from 'playwright-core';
import {offlineLogin} from './identity.mjs';

const base='http://127.0.0.1:8765';
const tokens=JSON.parse(await readFile(process.env.CC_BROWSER_IDENTITIES,'utf8'));
async function signedPage(t,width,path,setup) {
  const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',args:['--no-sandbox']});
  t.after(()=>browser.close());
  const context=await browser.newContext({viewport:{width,height:740},reducedMotion:'reduce'});
  await offlineLogin(context,base,'session-rider',tokens['session-rider']);
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  await setup(page);
  await page.goto(base+'/studio/#/'+path);
  await page.locator('#account button').click();
  await page.getByRole('button',{name:/Continue to secure sign-in/}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor();
  return page;
}

async function assertButtonContrast(button) {
  const [foreground, background] = await button.evaluate(el => {
    const style = getComputedStyle(el);
    return [style.color, style.backgroundColor];
  });
  function luminance(rgb) {
    const [r, g, b] = rgb.match(/[\d.]+/g).map(channel => {
      const value = Number(channel) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const [dark, light] = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  assert.ok((light + 0.05) / (dark + 0.05) >= 4.5, `Low text contrast: ${foreground} on ${background}`);
}

test('confirmation has an accessible name and safe keyboard, backdrop and navigation dismissal',async t=>{
  let leaveCalls=0;
  const page=await signedPage(t,320,'circles',async page=>{
    await page.route('**/v1/circles',r=>r.fulfill({json:[{id:'demo',name:'River commuters',role:'member'}]}));
    await page.route('**/v1/circles/demo/members/me',r=>{leaveCalls++;return r.fulfill({json:{left:true}});});
  });
  const leave=page.getByRole('button',{name:'Leave circle',exact:true});
  const dialog=page.getByRole('dialog',{name:'Leave River commuters?'});
  const primary=page.getByRole('button',{name:'Create circle'});
  await assertButtonContrast(primary);
  const normal=await primary.evaluate(b=>getComputedStyle(b).backgroundColor);
  await primary.hover();
  await page.waitForFunction(color=>getComputedStyle(document.querySelector('[data-create] button')).backgroundColor!==color,normal);
  await assertButtonContrast(primary);
  for(const width of [320,900]){
    await page.setViewportSize({width,height:740});
    await leave.click();
    await dialog.waitFor();
    await assertButtonContrast(dialog.getByRole('button',{name:'Leave circle',exact:true}));
    assert.equal(await dialog.getByRole('button',{name:'Go back'}).evaluate(el=>el===document.activeElement),true);
    assert.equal(await dialog.evaluate(el=>getComputedStyle(el).animationName),'none');
    const box=await dialog.boundingBox();
    assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=741);
    if(width===320)assert.ok(box.y+box.height>710);
    await page.keyboard.press('Escape');
    await dialog.waitFor({state:'detached'});
    await page.waitForFunction(()=>document.activeElement?.hasAttribute('data-leave'));
  }
  await leave.click();
  await dialog.waitFor();
  await page.mouse.click(2,2);
  await dialog.waitFor({state:'detached'});
  await leave.click();
  await dialog.getByRole('button',{name:'Close dialog'}).click();
  await dialog.waitFor({state:'detached'});
  await leave.click();
  await dialog.waitFor();
  await page.evaluate(()=>{location.hash='/help';});
  await dialog.waitFor({state:'detached'});
  assert.equal(leaveCalls,0);
});

test('leaving checkout while a cancellation quote loads cannot open a dialog or cancel the seat',async t=>{
  let quoteSeen, release, cancellations=0;
  const quoteStarted=new Promise(resolve=>{quoteSeen=resolve;});
  const gate=new Promise(resolve=>{release=resolve;});
  const page=await signedPage(t,400,'checkout/journey/ticket',async page=>{
    await page.route('**/v1/journeys/journey',r=>r.fulfill({json:{id:'journey',booking_mode:'instant',departure:new Date(Date.now()+86400000).toISOString(),stops:[{name:'Stop A',metres:0,minutes:0},{name:'Stop B',metres:1200,minutes:10}],tickets:[{id:'ticket',board:0,alight:1,state:'paid',fare_paise:1200,charged_paise:1200,refund_paise:0,confirmed:true}]}}));
    await page.route('**/v1/journeys/journey/tickets/ticket/notifications',r=>r.fulfill({json:[]}));
    await page.route('**/v1/journeys/journey/quote',async r=>{quoteSeen();await gate;await r.fulfill({json:{passenger_fee_if_cancelled_now_paise:120}}).catch(()=>{});});
    await page.route('**/v1/journeys/journey/tickets/ticket/cancel',r=>{cancellations++;return r.fulfill({json:{}});});
  });
  await page.getByRole('button',{name:'Cancel reservation'}).click();
  await quoteStarted;
  const cancelledRead=page.waitForEvent('requestfailed',r=>r.url().endsWith('/quote'));
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('link',{name:'Help',exact:true}).click();
  await cancelledRead;
  release();
  await page.getByRole('heading',{level:1}).waitFor();
  assert.equal(await page.getByRole('dialog').count(),0);
  assert.equal(cancellations,0);
});

test('a successful slow chat send preserves a newer draft and its next message has a separate key',async t=>{
  let release,started;const gate=new Promise(r=>{release=r;});const sendStarted=new Promise(r=>{started=r;});
  const sent=[],messages=[];
  const page=await signedPage(t,390,'chat/journey/ticket',async page=>{
    await page.route('**/v1/journeys/journey/tickets/ticket/messages',async route=>{
      if(route.request().method()==='GET')return route.fulfill({json:{role:'passenger',closed:false,messages}});
      const data=route.request().postDataJSON();sent.push(data);
      if(sent.length===1){started();await gate;}
      const row={id:data.message_id,text:data.text,sender:'passenger',created_at:new Date().toISOString()};
      messages.push(row);return route.fulfill({json:row});
    });
    await page.route('**/messages/read',r=>r.fulfill({json:{}}));
  });
  const draft=page.getByRole('textbox',{name:'Message',exact:true}),send=page.locator('form[data-chat] button');
  await draft.fill('Meet at the library entrance.');
  await send.click();await sendStarted;
  await draft.fill('I will wait by the gate.');
  release();
  await page.getByRole('log').getByText('Meet at the library entrance.',{exact:true}).waitFor();
  assert.equal(await draft.inputValue(),'I will wait by the gate.');
  await send.click();
  await page.getByRole('log').getByText('I will wait by the gate.',{exact:true}).waitFor();
  assert.equal(await draft.inputValue(),'');
  assert.equal(new Set(sent.map(s=>s.message_id)).size,2);
});
