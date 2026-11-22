import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as pause} from 'node:timers/promises';
import {rankPlaces,suggest,immediateMatches,automaticMatches} from '../../services/api/app/studio/app/data/geocoder.js';
import {reversePlace,pinResolver} from '../../services/api/app/studio/app/data/reverse-geocoder.js';
import {rememberSearchArea,searchArea} from '../../services/api/app/studio/app/data/search-area.js';
import {distance} from '../../services/api/app/studio/app/data/places.js';

const anchor={name:'Source',lat:16.25,lon:80.64};
const feature=(name,lat,lon,extra={})=>({properties:{name,countrycode:'IN',...extra},geometry:{type:'Point',coordinates:[lon,lat]}});

test('ambiguous names rank near the other stop without hiding same-named distant cities',()=>{
  const near={name:'Central Station',area:'Near city',lat:16.3,lon:80.65};
  const far={name:'Central Station',area:'Far city',lat:28.6,lon:77.2};
  assert.deepEqual(rankPlaces([far,near],'Central',anchor),[near,far]);
  assert.deepEqual(rankPlaces([far,near],'Central',{lat:28.5,lon:77.2}),[far,near]);
  assert.equal(immediateMatches('',null).length,0,'empty input without location must wait for a query');
});

test('search sends the selected stop bias and never reuses a different anchor cache',async t=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);urls.push(u);
    if(u.protocol==='file:')return {ok:true,json:async()=>[]};
    return {ok:true,json:async()=>({features:[feature('Central',Number(u.searchParams.get('lat'))+.01,Number(u.searchParams.get('lon')))]})};
  });
  const settings={signal:new AbortController().signal,geocoder:'https://place.test/api/',anchor};
  const first=await suggest('Central',settings);
  const second=await suggest('Central',{...settings,anchor:{lat:28.5,lon:77.2}});
  assert.notEqual(first.items[0].lat,second.items[0].lat);
  const online=urls.filter(u=>u.protocol==='https:');
  assert.equal(online.length,2);
  assert.equal(online[0].searchParams.get('lat'),'16.2500');
  assert.equal(online[1].searchParams.get('lon'),'77.2000');
  assert.equal(online[0].searchParams.has('bbox'),false,'distance biases results without excluding farther matches');
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

test('near and far matches appear together in distance order, including offline',async t=>{
  const near={lat:16.3,lon:80.65}, far={lat:17.4,lon:78.47},urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);urls.push(u);
    if(u.protocol==='file:')return {ok:true,json:async()=>[['Bus Station Local','BSL',near.lat,near.lon],['Bus Station Far','BSF',far.lat,far.lon]]};
    return {ok:true,json:async()=>({features:[feature('Bus Station Far',far.lat,far.lon),feature('Bus Station Local',near.lat,near.lon)]})};
  });
  const settings={signal:new AbortController().signal,geocoder:'https://radius.test/api/',anchor};
  const items=(await suggest('Bus Station',settings)).items;
  const nearby=items.map(p=>p.name);
  assert.deepEqual(nearby.filter(name=>name.startsWith('Bus Station')),['Bus Station Local','Bus Station Far']);
  const distances=items.map(p=>distance(p,anchor));
  assert.deepEqual(distances,[...distances].sort((a,b)=>a-b));
  const reverse=(await suggest('Bus Station',{...settings,anchor:far}));
  assert.deepEqual(reverse.items.map(p=>p.name).filter(name=>name.startsWith('Bus Station')),['Bus Station Far','Bus Station Local']);
  assert.ok((await suggest('Bus Station Far',settings)).items.some(p=>p.name==='Bus Station Far'));
  assert.equal(urls.filter(u=>u.protocol==='https:').at(-1).searchParams.has('bbox'),false);
  assert.deepEqual((await suggest('Bus Station',{...settings,geocoder:null})).items.map(p=>p.name),nearby);
});

test('international results sort across the date line',async t=>{
  let request;
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);if(u.protocol==='file:')return {ok:true,json:async()=>[]};request=u;
    return {ok:true,json:async()=>({features:[feature('Island Landing',0,-179.9,{countrycode:'FJ'}),feature('Island Far',0,178,{countrycode:'FJ'})]})};
  });
  const result=await suggest('Island',{signal:new AbortController().signal,geocoder:'https://date.test/api/',anchor:{lat:0,lon:179.9}});
  assert.deepEqual(result.items.map(p=>p.name),['Island Landing','Island Far']);
  assert.equal(request.searchParams.has('countrycode'),false);
  assert.equal(request.searchParams.has('bbox'),false);
});


test('distance comes before text prominence and does not drop a match at the current point',()=>{
  const business={name:'Hyderabad Biryani',lat:16.3,lon:80.65};
  const city={name:'Hyderabad',locality:true,lat:17.4,lon:78.47};
  const result=automaticMatches([business,city],'Hyderabad',anchor);
  assert.deepEqual(result.items,[business,city]);
  assert.deepEqual(automaticMatches([city,business],'Hyd',anchor).items,[business,city]);
  const here={...anchor,name:'Hyderabad Store'};
  assert.deepEqual(automaticMatches([city,business,here],'Hyd',anchor).items,[here,business,city]);
  assert.equal(automaticMatches([business,city],'Hyd').items[0],city,'without a location, retain text relevance');
});

test('search issues one location-biased lookup without a radius and outages retain station matches',async t=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);if(u.protocol==='file:')return {ok:true,json:async()=>[]};urls.push(u);
    return {ok:true,json:async()=>({features:[feature('Hyderabad',17.4,78.47,{osm_key:'place',osm_value:'city'}),feature('Hyderabad Kitchen',16.3,80.65)]})};
  });
  const settings={signal:new AbortController().signal,geocoder:'https://automatic.test/api/',anchor};
  const result=await suggest('Hyderabad',settings);
  assert.equal(urls.length,1);assert.equal(urls[0].searchParams.has('bbox'),false);
  assert.deepEqual(result.items.map(p=>p.name),['Hyderabad Kitchen','Hyderabad']);
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);if(u.protocol==='file:')return {ok:true,json:async()=>[]};
    throw Error('offline');
  });
  const failed=await suggest('Tenali',{...settings,geocoder:'https://partial.test/api/'});
  assert.ok(failed.items.some(p=>p.name==='Tenali Junction'));assert.equal(failed.offline,true);
});

test('mapped international places work with or without GPS and a country label',async t=>{
  const urls=[];
  t.mock.method(globalThis,'fetch',async url=>{
    const u=new URL(url);if(u.protocol==='file:')return {ok:true,json:async()=>[]};urls.push(u);
    return {ok:true,json:async()=>({features:[
      feature('Central India',12.97,77.59),
      feature('Central Foreign',12.98,77.60,{countrycode:'US'}),
      feature('Central Unknown',12.99,77.61,{countrycode:''}),
      feature('Central Country Name',13,77.62,{countrycode:'',country:'India'})
    ]})};
  });
  const settings={signal:new AbortController().signal,geocoder:'https://india.test/api/'};
  const result=await suggest('Central',settings);
  assert.deepEqual(result.items.map(p=>p.name).sort(),['Central Country Name','Central Foreign','Central India','Central Unknown']);
  const wide=await suggest('Central',{...settings,anchor});
  assert.deepEqual(wide.items.map(p=>p.name).sort(),['Central Country Name','Central Foreign','Central India','Central Unknown']);
  assert.ok(urls.every(u=>!u.searchParams.has('countrycode')));
});

test('valid coordinates work worldwide even offline without sending a lookup',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>{throw Error('unexpected lookup');});
  const opts={signal:new AbortController().signal,geocoder:null};
  assert.equal((await suggest('17.4,78.47',opts)).items[0].lat,17.4);
  assert.equal((await suggest('51.5,-0.12',opts)).items[0].lon,-.12);
  assert.equal(fetch.mock.callCount(),0);
});

test('search uses a fresh approximate device area before a distant stop and expires it',async t=>{
  let now=1000;t.mock.method(Date,'now',()=>now);
  const other={lat:28.6,lon:77.2};
  rememberSearchArea({lat:12.9715987,lon:77.5945627});
  assert.deepEqual(searchArea(other),{lat:12.97,lon:77.59});
  now+=300001;
  assert.equal(searchArea(other),other);
  assert.equal(searchArea(null),null);
});
