import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {rankPlaces,suggest,immediateMatches} from '../../services/api/app/studio/app/data/geocoder.js';
import {reversePlace,pinResolver} from '../../services/api/app/studio/app/data/reverse-geocoder.js';

const anchor={name:'Source',lat:16.25,lon:80.64};
const feature=(name,lat,lon,extra={})=>({properties:{name,...extra},geometry:{type:'Point',coordinates:[lon,lat]}});

test('ambiguous names rank near the other stop without hiding same-named distant cities',()=>{
  const near={name:'Central Station',area:'Near city',lat:16.3,lon:80.65};
  const far={name:'Central Station',area:'Far city',lat:28.6,lon:77.2};
  assert.deepEqual(rankPlaces([far,near,anchor],'Central',anchor),[near,far]);
  assert.deepEqual(rankPlaces([far,near],'Central',{lat:28.5,lon:77.2}),[far,near]);
  assert.equal(immediateMatches('',{lat:51.5,lon:-.12}).length,0,'a London anchor must not suggest Tenali');
});

test('search sends the selected stop bias and never reuses a different anchor cache',async t=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);urls.push(u);
    if(u.protocol==='file:')return {ok:true,json:async()=>[]};
    return {ok:true,json:async()=>({features:[feature('Central Station',Number(u.searchParams.get('lat'))+.01,Number(u.searchParams.get('lon')))]})};
  });
  const settings={signal:new AbortController().signal,geocoder:'https://place.test/api/',anchor};
  const first=await suggest('Central',settings);
  const second=await suggest('Central',{...settings,anchor:{lat:28.5,lon:77.2}});
  assert.notEqual(first.items[0].lat,second.items[0].lat);
  const online=urls.filter(u=>u.protocol==='https:');
  assert.equal(online.length,2);
  assert.equal(online[0].searchParams.get('lat'),'16.2500');
  assert.equal(online[1].searchParams.get('lon'),'77.2000');
  assert.equal(online[0].searchParams.has('bbox'),false,'explicit far-city search must remain possible');
});

test('reverse lookup names a pin but preserves exactly selected coordinates',async t=>{
  let observed;
  t.mock.method(globalThis,'fetch',async url=>{observed=new URL(url);return {ok:true,json:async()=>({features:[feature('Station Road',16.25001,80.64002,{city:'Tenali',state:'Andhra Pradesh'})]})};});
  const result=await reversePlace(anchor,{geocoder:'https://reverse.test/api/',signal:new AbortController().signal});
  assert.equal(observed.pathname,'/reverse');
  assert.equal(result.name,'Station Road');
  assert.equal(result.lat,anchor.lat);assert.equal(result.lon,anchor.lon);
  assert.match(result.area,/Tenali/);
});

test('unavailable or implausibly far reverse results give honest coordinate labels',async t=>{
  t.mock.method(globalThis,'fetch',async()=>({ok:true,json:async()=>({features:[feature('Wrong city',28.6,77.2)]})}));
  const result=await reversePlace(anchor,{geocoder:'https://far.test/api/',signal:new AbortController().signal});
  assert.equal(result.name,'16.25000, 80.64000');
  assert.match(result.area,/address unavailable/);
  const unconfigured=await reversePlace(anchor,{geocoder:null});
  assert.equal(result.name,unconfigured.name);
});

test('rapid pin moves, independent pins and manual replacements reject stale replies',async()=>{
  const controller=new AbortController(), points=[anchor,{name:'Other',lat:16.5,lon:80.61}], requests=[];
  const resolver=pinResolver({signal:controller.signal,delay:0,current:()=>points,
    change:(i,p)=>{points[i]=p;resolver.sync();return true;},
    resolve:(p,signal)=>new Promise(resolve=>requests.push({p,signal,resolve}))});
  resolver.move(0,{lat:16.26,lon:80.65});await pause(5);
  resolver.move(0,{lat:16.27,lon:80.66});await pause(5);
  resolver.move(1,{lat:16.51,lon:80.62});await pause(5);
  assert.equal(requests[0].signal.aborted,true);
  requests[0].resolve({...requests[0].p,name:'Stale name'});await pause(0);
  assert.notEqual(points[0].name,'Stale name');
  requests[2].resolve({...requests[2].p,name:'Destination Road'});await pause(0);
  assert.equal(points[1].name,'Destination Road');
  points[0]={name:'Typed station',lat:16.28,lon:80.67};resolver.sync();
  requests[1].resolve({...requests[1].p,name:'Old origin'});await pause(0);
  assert.equal(points[0].name,'Typed station');
  resolver.move(0,{lat:16.29,lon:80.68});await pause(5);controller.abort();
  requests[3].resolve({...requests[3].p,name:'After leaving'});await pause(0);
  assert.notEqual(points[0].name,'After leaving');
});
