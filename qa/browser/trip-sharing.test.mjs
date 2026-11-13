import test from 'node:test';
import assert from 'node:assert/strict';
import {createTripSharing} from '../../services/api/app/studio/app/data/trip-sharing.js';

function device(t){
  const oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');
  const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  const events=new EventTarget(),callbacks={cleared:0};
  Object.defineProperty(globalThis,'window',{configurable:true,value:events});
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{geolocation:{
    watchPosition(success,error){callbacks.success=success;callbacks.error=error;return 7;},
    clearWatch(){callbacks.cleared++;},getCurrentPosition(){}
  }}});
  t.after(()=>{
    if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete globalThis.window;
    if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;
  });
  return {events,callbacks};
}
const response=()=>({id:'share-id',token:'test-token',expires_at:new Date(Date.now()+3600000).toISOString()});
const fix=()=>({coords:{latitude:16.3,longitude:80.6,accuracy:12},timestamp:Date.now()});

test('stop clears device tracking even while an upload is in flight',async t=>{
  const {callbacks}=device(t),writes=[],stopped=[];
  let finish;
  const sharing=createTripSharing({startShare:async()=>response(),
    locateShare:async(id,data)=>{writes.push({id,data});return new Promise(resolve=>{finish=resolve;});},
    stopShare:async id=>stopped.push(id)
  },()=>{});
  t.after(()=>sharing.stop());
  await sharing.start('journey','ticket');
  assert.equal(writes.length,0,'starting alone must not invent a location');
  const pending=callbacks.success(fix());
  assert.equal(writes.length,1);
  assert.equal(writes[0].data.sequence,1);
  await sharing.stop();
  assert.equal(callbacks.cleared,1);
  finish({accepted:true,updated_at:new Date().toISOString()});await pending;
  assert.equal(sharing.current,null,'a late upload response must not restart sharing');
  assert.deepEqual(stopped,['share-id']);
});

test('sharing indicates a live fix only after delivery and changes to stale on signal loss', async t => {
  const {callbacks} = device(t);
  const sharing = createTripSharing({
    startShare: async () => response(),
    locateShare: async () => ({accepted: true, updated_at: new Date().toISOString()}),
    stopShare: async () => {}
  }, () => {});
  try {
    await sharing.start('journey', null);
    assert.equal(sharing.current.state, 'waiting');
    await callbacks.success(fix());
    assert.equal(sharing.current.state, 'live');
    callbacks.error({code: 2});
    assert.equal(sharing.current.state, 'stale');
  } finally {
    await sharing.stop();
  }
});

test('permission denial revokes sharing and gives a clear recovery message',async t=>{
  const {callbacks}=device(t),messages=[],stopped=[];
  const sharing=createTripSharing({startShare:async()=>response(),stopShare:async id=>stopped.push(id)},
    (current,problem)=>{if(problem)messages.push(problem);});
  t.after(()=>sharing.stop());
  await sharing.start('journey',null);
  callbacks.error({code:1});
  assert.equal(sharing.current,null);
  assert.deepEqual(stopped,['share-id']);
  assert.match(messages[0],/Location permission denied/);
});

test('closing the page requests keepalive revocation and clears the GPS watch',async t=>{
  const {events,callbacks}=device(t),stopped=[];
  const sharing=createTripSharing({startShare:async()=>response(),stopShare:async(...args)=>stopped.push(args)},()=>{});
  t.after(()=>sharing.stop());
  await sharing.start('journey','ticket');
  events.dispatchEvent(new Event('pagehide'));
  assert.equal(sharing.current,null);
  assert.equal(callbacks.cleared,1);
  assert.deepEqual(stopped,[['share-id',true]]);
});
