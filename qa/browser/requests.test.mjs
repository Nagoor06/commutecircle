import test from 'node:test';
import assert from 'node:assert/strict';
import {liveClient} from '../../services/api/app/studio/app/data/live.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

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
