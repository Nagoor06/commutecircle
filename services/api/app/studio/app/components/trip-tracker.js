import {esc,clock,icon} from '../ui.js';
import {trackingState} from '../data/tracking.js';
import {trackingMap} from './tracking-map.js';

export async function tripTracker(root,{read,signal,driver=false}){
  root.insertAdjacentHTML('beforeend',`<section class="panel tracking-panel">
    <div data-route></div><div class="tracking-summary"><span data-live-status class="share-state" role="status">Connecting to live location…</span><button data-refresh class="btn secondary compact">${icon('refresh',16)} Refresh location</button></div>
    <p data-update class="fine"></p><p data-tracking-error class="fine" role="status" hidden></p>
    <div data-map-consent hidden><button data-show-map class="btn primary">${icon('map')} Show live map</button><p class="fine">Opening the map shares the viewed area with OpenFreeMap. Your private link is never sent to the map provider.</p></div>
    <div data-tracking-map hidden></div><p data-accuracy class="fine"></p>
    <a data-external class="text-btn" hidden target="_blank" rel="noopener noreferrer">Open last known location on OpenStreetMap</a>
    <p class="fine">Live GPS updates refresh about every 5 seconds while this page is open. An accuracy circle shows the device’s estimated margin of error. Updates can pause when the traveller loses signal or backgrounds their browser. This is not emergency monitoring.</p>
  </section>`);
  const get=s=>root.querySelector(s), status=get('[data-live-status]'), error=get('[data-tracking-error]'), host=get('[data-tracking-map]');
  let data,received=0,busy=false,ended=false,failed=false,timer,ticker,map,loading=false,mapController,wantsMap=false;
  function clearMap(){mapController?.abort();mapController=null;map=null;loading=false;host.hidden=true;host.replaceChildren();}
  function erase(){clearMap();data=null;get('[data-external]').hidden=true;get('[data-external]').removeAttribute('href');get('[data-map-consent]').hidden=true;get('[data-accuracy]').textContent='';get('[data-update]').textContent='';}
  function end(message){ended=true;erase();status.textContent=message;status.dataset.state='ended';clearInterval(timer);clearInterval(ticker);get('[data-refresh]').hidden=true;}
  async function openMap(){
    if(!data?.position||map||loading||signal.aborted)return;
    wantsMap=true;loading=true;host.hidden=false;get('[data-map-consent]').hidden=true;
    const controller=new AbortController();mapController=controller;
    try{
      const result=await trackingMap(host,AbortSignal.any([signal,controller.signal]));
      if(signal.aborted||controller.signal.aborted)return;
      map=result;paint();
    }catch(e){
      if(signal.aborted||controller.signal.aborted)return;
      wantsMap=false;clearMap();error.hidden=false;error.textContent='The live map could not load. Retry Show live map, or use the last known location link.';
      get('[data-map-consent]').hidden=false;
    }finally{if(mapController===controller)loading=false;}
  }
  function paint(){
    if(!data||ended)return;
    const elapsed=performance.now()-received, state=trackingState(data,elapsed);
    if(state==='ended'){if(driver){erase();status.textContent='The driver’s location sharing has ended. Waiting for a new session…';status.dataset.state='off';}else end('This sharing link has ended. Ask your traveller for a new link.');return;}
    if(state==='off'){erase();status.textContent='The driver is not sharing vehicle location with passengers yet.';status.dataset.state='off';return;}
    const effective=failed&&state==='live'?'stale':state;
    status.dataset.state=effective;
    status.textContent=effective==='live'?'Live location · '+(data.source==='driver'?'driver GPS':'passenger GPS'):effective==='stale'?'Updates paused · last known location':'Waiting for the first GPS fix…';
    const age=data.position?Math.max(0,Math.floor((Date.parse(data.server_time)+elapsed-Date.parse(data.position.observed_at))/1000)):null;
    get('[data-update]').textContent=(age===null?'No location received yet.':`GPS measured ${age<60?age+' seconds':Math.floor(age/60)+' minutes'} ago · ${clock(data.position.observed_at)}.`)+' Sharing ends '+clock(data.expires_at)+'.';
    if(data.position){
      const p=data.position,external=get('[data-external]');
      external.hidden=false;external.href='https://www.openstreetmap.org/?mlat='+p.latitude+'&mlon='+p.longitude+'#map=16/'+p.latitude+'/'+p.longitude;
      get('[data-accuracy]').textContent='Estimated GPS accuracy: ±'+Math.round(p.accuracy_m)+' m.'+(p.accuracy_m>100?' This fix is approximate; do not use it to identify an exact meeting point.':'')+' Opening the external map shares this position with OpenStreetMap.';
      get('[data-map-consent]').hidden=!!map||loading;
      map?.update(data,effective);
      if(wantsMap&&!map&&!loading)openMap();
    }
  }
  async function refresh(){
    if(busy||signal.aborted||ended)return;busy=true;
    try{
      const fresh=await read(signal);if(signal.aborted)return;
      data=fresh;received=performance.now();failed=false;error.hidden=true;
      if(data.origin){
        get('[data-route]').innerHTML=`<h2>${esc(data.origin)} → ${esc(data.destination)}</h2><p class="fine">${data.source==='driver'?'Vehicle location from the driver’s device':'Traveller location from the passenger’s device'}${data.vehicle?' · '+esc([data.vehicle.color,data.vehicle.make,data.vehicle.model].filter(Boolean).join(' ')):''}</p>`;
      }
      paint();
    }catch(e){
      if(signal.aborted)return;
      if([401,403,404,410].includes(e.status)){end(e.status===401?'Sign in again to view your booked vehicle.':driver?'Location access has ended. This trip or sharing session is no longer active.':'This sharing link has ended. Ask your traveller for a new link.');return;}
      failed=true;error.hidden=false;error.textContent=e.status===409?e.message:'Connection interrupted. Retrying automatically; the last position may be out of date.';
      if(!data)status.textContent='Live location unavailable right now.';
      paint();
    }finally{busy=false;}
  }
  get('[data-refresh]').onclick=refresh;get('[data-show-map]').onclick=openMap;
  const hidden=()=>{if(document.hidden){if(data)map?.update(data,'stale');}else{paint();refresh();}};
  document.addEventListener('visibilitychange',hidden,{signal});
  window.addEventListener('online',refresh,{signal});
  signal.addEventListener('abort',()=>{clearInterval(timer);clearInterval(ticker);clearMap();},{once:true});
  await refresh();
  if(!ended&&!signal.aborted){timer=setInterval(()=>{if(!document.hidden)refresh();},5000);ticker=setInterval(()=>{if(!document.hidden)paint();},1000);}
}
