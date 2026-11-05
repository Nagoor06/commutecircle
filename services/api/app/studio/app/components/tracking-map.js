import {leaflet} from './leaflet.js';
import {vectorBase} from './vector-base.js';
import {icon} from '../ui.js';
import {finitePlace,distance} from '../data/places.js';
import {motion} from '../data/tracking.js';

export async function trackingMap(host, signal) {
  const L=await leaflet();
  if(signal.aborted)return;
  host.innerHTML=`<div class="live-atlas" role="region" aria-label="Live trip map"><div data-live-canvas></div><button data-follow class="btn secondary compact">${icon('target',16)} Following location</button><small data-tiles role="status"></small></div>`;
  const map=L.map(host.querySelector('[data-live-canvas]'),{scrollWheelZoom:false,maxZoom:19,minZoom:2});
  map.attributionControl.addAttribution('<a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> · <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>');
  const layer=vectorBase(L,signal).addTo(map), followButton=host.querySelector('[data-follow]');
  layer.on('tileerror',()=>{host.querySelector('[data-tiles]').textContent='Street map unavailable. Location updates continue.';});
  layer.on('tileload',()=>{host.querySelector('[data-tiles]').textContent='';});
  let marker, circle, latest, stamp=0, frame, following=true, stopsKey='', stopMarkers=[];
  function follow(){following=true;followButton.innerHTML=icon('target',16)+' Following location';if(latest)map.panTo(latest,{animate:false});}
  followButton.onclick=follow;
  map.on('dragstart',()=>{following=false;followButton.innerHTML=icon('target',16)+' Follow location';});
  const resize=new ResizeObserver(()=>map.invalidateSize());resize.observe(host);
  signal.addEventListener('abort',()=>{cancelAnimationFrame(frame);resize.disconnect();map.remove();host.replaceChildren();},{once:true});
  return {
    update(data,state){
      const p=data.position;if(!p||signal.aborted)return;
      const live=state==='live', next=[p.latitude,p.longitude], observed=Date.parse(p.observed_at);
      host.classList.toggle('tracking-paused',!live);
      if(!live){cancelAnimationFrame(frame);if(latest)marker?.setLatLng(latest);}
      const key=JSON.stringify(data.stops);
      if(key!==stopsKey){
        stopMarkers.forEach(m=>m.remove());stopMarkers=[];stopsKey=key;
        for(const [i,s] of (data.stops||[]).entries())if(finitePlace(s)){
          const label=document.createElement('span');label.textContent=s.name;
          stopMarkers.push(L.circleMarker([s.lat,s.lon],{radius:5,color:'#345e4d',fillColor:'white',fillOpacity:1,weight:2})
            .bindTooltip(label).addTo(map));
        }
      }
      const source=data.source==='driver'?'Vehicle · driver GPS':'Traveller · passenger GPS';
      if(!marker){
        marker=L.marker(next,{title:source,alt:source,zIndexOffset:1000,icon:L.divIcon({className:'live-position',
          html:`<span class="live-marker ${data.source==='driver'?'vehicle-marker':'traveller-marker'}">${icon(data.source==='driver'?'car':'user',25)}</span>`,iconSize:[48,48],iconAnchor:[24,24]})}).addTo(map);
        const label=document.createElement('span');label.textContent=source;marker.bindTooltip(label);
        circle=L.circle(next,{radius:p.accuracy_m,color:'#146b56',weight:1,fillOpacity:.09,interactive:false}).addTo(map);
        latest=next;stamp=observed;map.setView(next,15);return;
      }
      if(observed<=stamp)return;
      stamp=observed;cancelAnimationFrame(frame);
      const previous=latest;latest=next;
      circle.setLatLng(next).setRadius(p.accuracy_m);
      // Bad GPS jumps and reduced-motion preferences snap to the reported fix.
      const animate=live&&!document.hidden&&!matchMedia('(prefers-reduced-motion: reduce)').matches&&
        distance({lat:previous[0],lon:previous[1]},{lat:next[0],lon:next[1]})<1000;
      if(animate){
        const from=marker.getLatLng(),began=performance.now();
        const step=now=>{const t=Math.min(1,(now-began)/900);marker.setLatLng(motion([from.lat,from.lng],next,t));if(t<1)frame=requestAnimationFrame(step);};
        frame=requestAnimationFrame(step);
      }else marker.setLatLng(next);
      if(following)map.panTo(next,{animate:false});
    }
  };
}
