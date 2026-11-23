import test from 'node:test';
import assert from 'node:assert/strict';
import {liveClient} from '../../services/api/app/studio/app/data/live.js';
import {activeReservation, travellerName} from '../../services/api/app/studio/app/shared/booking.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('guest selection matches the right ticket and releases expired approval requests', () => {
  const now = Date.parse('2026-11-23T10:00:00Z');
  const t = {board:0, alight:2, guest_name:'José Luna', state:'requested', expires:new Date(now+1000).toISOString()};
  assert.ok(activeReservation(t,0,2,travellerName('  JOSE\u0301   LUNA '),now));
  assert.equal(activeReservation(t,0,2,null,now),false);
  assert.equal(activeReservation(t,0,2,'José Luna',now+1000),false);
  assert.ok(activeReservation({...t,state:'paid'},0,2,'José Luna',now+1000));
  assert.equal(activeReservation({...t,state:'paid'},0,1,'José Luna',now),false);
});

test('trip history stops on a repeated full page and deduplicates overlapping pages', async t => {
  const first = Array.from({length:50}, (_, id) => ({id}));
  let nextPage = first;
  const seen = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const offset = Number(new URL(url).searchParams.get('offset'));
    seen.push(offset);
    assert.ok(offset <= 50, 'Repeated pages must terminate');
    return Response.json(offset === 0 ? first : nextPage);
  });
  const client = liveClient('test', 'https://api.example');
  await assert.rejects(client.allMine(), /Trip history stopped updating/);
  nextPage = [{id:49}, {id:50}];
  const rows = await client.allMine();
  assert.equal(rows.length,51);
  assert.deepEqual(seen,[0,50,0,50]);
});

test('search recovery is bounded and keeps its screen cancellation signal intact', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  let requests=0;
  t.mock.method(globalThis, 'fetch', (_url, {signal}) => new Promise((_resolve, reject) => {
    requests++;
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  const client = liveClient('test', 'https://api.example');
  const view = new AbortController();
  const slow = assert.rejects(client.search({}, view.signal), /took too long/);
  t.mock.timers.tick(18000);
  await flush(); t.mock.timers.tick(1500); await flush();
  t.mock.timers.tick(18000);
  await flush(); t.mock.timers.tick(3000); await flush();
  t.mock.timers.tick(18000);
  await slow;
  assert.equal(requests,3);
  assert.equal(view.signal.aborted, false);

  const stale = assert.rejects(client.search({}, view.signal), {name: 'AbortError'});
  view.abort();
  await stale;
});

test('a transient unavailable search retries the same query and reports progress',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const bodies=[],progress=[];
  t.mock.method(globalThis,'fetch',async(_url,options)=>{
    bodies.push(JSON.parse(options.body));
    return bodies.length===1?{ok:false,status:503,json:async()=>({})}:
      {ok:true,json:async()=>({items:[],more:false})};
  });
  const query={after:'2026-11-10T00:00:00Z',origin:{name:'Public A'}};
  const result=liveClient(null,'https://api.example').search(query,undefined,m=>progress.push(m));
  await flush();assert.match(progress[0],/Retrying automatically/);
  t.mock.timers.tick(1500);
  assert.deepEqual(await result,{items:[],more:false});
  assert.deepEqual(bodies,[query,query]);
});

test('changing the query cancels recovery before another network request',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return {ok:false,status:503,json:async()=>({})};});
  const signal=new AbortController();
  const pending=assert.rejects(liveClient(null,'https://api.example').search({},signal.signal),{name:'AbortError'});
  await flush();signal.abort();await pending;
  t.mock.timers.tick(60000);await flush();
  assert.equal(count,1);
});

test('authentication errors and payment operations are not automatically replayed',async t=>{
  let count=0;
  t.mock.method(globalThis,'fetch',async()=>{count++;return {ok:false,status:401,json:async()=>({})};});
  const client=liveClient('expired','https://api.example');
  await assert.rejects(client.search({}),/Session ended/);
  assert.equal(count,1);
  t.mock.method(globalThis,'fetch',async()=>{count++;throw Error('Connection lost');});
  await assert.rejects(client.pay('journey','ticket'),/could not be reached/);
  assert.equal(count,2);
});
