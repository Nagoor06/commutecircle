import assert from 'node:assert/strict';
import test from 'node:test';
import {readJson} from '../../services/api/app/studio/app/data/read-json.js';
import {suggest} from '../../services/api/app/studio/app/data/geocoder.js';
import {calculateRoute} from '../../services/api/app/studio/app/data/road-route.js';

const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('stalled JSON assets time out and caller cancellation stays effective',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  let calls=0;
  t.mock.method(globalThis,'fetch',(_url,{signal})=>new Promise((_resolve,reject)=>{
    calls++;
    signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
  }));
  const expired=assert.rejects(readJson('https://assets.example/config'),{name:'AbortError'});
  t.mock.timers.tick(5000);
  await expired;
  const view=new AbortController();
  const stopped=assert.rejects(readJson('https://assets.example/config',{signal:view.signal}),{name:'AbortError'});
  view.abort();
  await stopped;
  await assert.rejects(readJson('https://assets.example/config',{signal:view.signal}),{name:'AbortError'});
  assert.equal(calls,2);
});

test('a stalled station shard does not block online place search',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const requests=[];
  t.mock.method(globalThis,'fetch',(url,{signal})=>{
    requests.push(String(url));
    if(String(url).includes('/assets/stations/'))return new Promise((_resolve,reject)=>{
      signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });
    return Promise.resolve({ok:true,json:async()=>({features:[{
      properties:{name:'Stockholm',osm_key:'place',osm_value:'city'},
      geometry:{coordinates:[18.0686,59.3293]}
    }]})});
  });
  const found=suggest('Stockholm',{signal:new AbortController().signal,geocoder:'https://places.example/api/'});
  await flush();t.mock.timers.tick(5000);
  assert.equal((await found).items[0].name,'Stockholm');
  assert.equal(requests.length,2);
  assert.ok(requests[1].startsWith('https://places.example/api/'));
});

test('a missing optional stop catalogue preserves valid road timings, including long geometry',async t=>{
  const points=[{name:'North station',lat:40.8,lon:-74},{name:'South station',lat:40.7,lon:-74}];
  const warnings=[];
  const geometry=Array.from({length:180000},(_,i)=>[-74,40.8-i/1800000]);
  t.mock.method(globalThis,'fetch',async url=>String(url).includes('/assets/stations/')?
    {ok:false}:{ok:true,json:async()=>({code:'Ok',routes:[{
      legs:[{distance:12000,duration:900}],geometry:{coordinates:geometry}
    }]})});
  const result=await calculateRoute(points,true,new AbortController().signal,m=>warnings.push(m));
  assert.deepEqual(result.map(p=>[p.km,p.minutes]),[[0,0],[12,15]]);
  assert.match(warnings[0],/only your selected stops/);
});
