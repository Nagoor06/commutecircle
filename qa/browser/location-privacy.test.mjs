import test from 'node:test';
import assert from 'node:assert/strict';
import {nearbyPublicStops} from '../../services/api/app/studio/app/data/public-stops.js';
import {calculateRoute} from '../../services/api/app/studio/app/data/road-route.js';

test('nearby pickup lookup never sends device coordinates and returns public points', async t => {
  const requests=[];
  t.mock.method(globalThis,'fetch',async url=>{
    requests.push(String(url));
    return {ok:true,json:async()=>[['Public station',12.01,77.01],['Far station',20,80]]};
  });
  const point={lat:12.009876,lon:77.009876};
  const matches=await nearbyPublicStops(point,new AbortController().signal);
  assert.equal(matches[0].name,'Public station');
  assert.equal(matches[0].lat,12.01);
  assert.equal(requests.length,1);
  assert.ok(requests[0].endsWith('/assets/stations/nearby.json'));
  assert.ok(!requests[0].includes(String(point.lat))&&!requests[0].includes(String(point.lon)));
});

test('road distance and duration are accumulated from provider legs; failure stays explicit', async t => {
  const stops=[{name:'A',lat:12,lon:77},{name:'B',lat:12.1,lon:77.1},{name:'C',lat:12.2,lon:77.2}];
  const signal=new AbortController().signal;
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({code:'Ok',routes:[{legs:[{distance:12000,duration:610},{distance:8000,duration:480}],geometry:{coordinates:[[77,12],[77.1,12.1],[77.2,12.2]]}}]})}));
  const result=await calculateRoute(stops,false,signal);
  assert.deepEqual(result.map(s=>s.km),[0,12,20]);
  assert.deepEqual(result.map(s=>s.minutes),[0,11,19]);
  t.mock.method(globalThis,'fetch',async()=>{throw Error('Offline')});
  await assert.rejects(calculateRoute(stops,false,signal),/enter measured distance and time/);
  await assert.rejects(calculateRoute([{name:'Unmapped'},stops[1]],false,signal),/Choose mapped suggestions/);
});
