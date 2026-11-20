import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const code=await readFile(new URL('../../services/api/app/studio/sw.js',import.meta.url),'utf8');
const binding='11111111-1111-4111-8111-111111111111';
const path='#/chat/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
function worker() {
  let saved,closed=0;const handlers={},notifications=[],opened=[],windows=[];
  const db={close(){},createObjectStore(){},transaction(){
    const tx={objectStore(){return {
      get(){const req={};queueMicrotask(()=>{req.result=saved;req.onsuccess();queueMicrotask(()=>tx.oncomplete());});return req;},
      put(value){saved=value;}
    };}};return tx;
  }};
  const scope='https://example.test/commutecircle/';
  const self={registration:{scope,getNotifications:async()=>notifications.map(()=>({close(){closed++;}})),showNotification:async(title,options)=>notifications.push({title,...options})},
    clients:{claim:async()=>{},matchAll:async()=>windows,openWindow:async url=>opened.push(url)},
    skipWaiting(){},addEventListener(type,handler){handlers[type]=handler;}};
  vm.runInNewContext(code,{self,URL,Response,fetch,Promise,indexedDB:{open(){const req={};queueMicrotask(()=>{req.result=db;req.onsuccess();});return req;}}});
  async function event(type,data={}) {let done;handlers[type]({...data,waitUntil(value){done=value;}});await done;}
  const bind=async(value,expected)=>{let response;await event('message',{source:{url:scope},data:{type:'cc:binding',value,expected},ports:[{postMessage(value){response=value;}}]});return response;};
  const push=(extra={})=>event('push',{data:{json:()=>({binding,path,tag:'chat-ticket',message_id:'message-1',...extra})}});
  return {event,bind,push,notifications,opened,windows,scope,get closed(){return closed;}};
}

test('background push hides message content, rejects stale accounts and deduplicates retries',async()=>{
  const w=worker();await w.bind(binding);
  await w.push({text:'Private text',title:'Untrusted sender title',body:'Private text'});
  await w.push();assert.equal(w.notifications.length,1);
  assert.equal(w.notifications[0].body,'Open your private booking chat to reply.');
  await w.bind(binding);await w.push();assert.equal(w.notifications.length,1,'Restoring the same device must preserve deduplication');
  await w.bind('44444444-4444-4444-8444-444444444444');
  await w.push({message_id:'message-2'});assert.equal(w.notifications.length,1);
  await w.event('notificationclick',{notification:{data:{path,binding},close(){}}});assert.equal(w.opened.length,0);
});

test('sign-out closes alerts and a late device generation cannot revoke a newer one',async()=>{
  const w=worker();await w.bind(binding);await w.push();
  const newer='44444444-4444-4444-8444-444444444444';await w.bind(newer);
  const before=w.closed;const result=await w.bind(null,binding);
  assert.equal(result.applied,false);assert.equal(w.closed,before);
  await w.push({binding:newer,message_id:'message-2'});assert.equal(w.notifications.length,2);
  await w.bind(null,newer);await w.push({binding:newer,message_id:'message-3'});
  assert.equal(w.notifications.length,2);assert.ok(w.closed>before);
});

test('active chat suppresses system popups and clicks cannot open arbitrary links',async()=>{
  const w=worker();await w.bind(binding);const messages=[];
  w.windows.push({url:w.scope+path,visibilityState:'visible',postMessage:data=>messages.push(data)});
  await w.push();assert.equal(w.notifications.length,0);assert.equal(messages[0].notified,false);
  w.windows.length=0;
  await w.push({path:'https://evil.example/',message_id:'unsafe'});assert.equal(w.notifications.length,0);
  await w.event('notificationclick',{notification:{data:{path:'https://evil.example/',binding},close(){}}});
  assert.equal(w.opened.length,0);
  await w.event('notificationclick',{notification:{data:{path,binding},close(){}}});
  assert.equal(w.opened[0],w.scope+path);
});
