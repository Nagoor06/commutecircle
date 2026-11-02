import {attachMap} from './street-map.js?rev=3';
const stops=[{name:'Tenali Junction area',lat:16.243,lon:80.640},{name:'Tenali bus stand area',lat:16.248,lon:80.650}];
const selected=stops.map(p=>({...p}));
const cache=new Map();
let nextSearch=0;
function coordinate(text){
  const pair=text.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  return pair?{lat:Number(pair[1]),lon:Number(pair[2])}:null;
}
const valid=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=85&&Math.abs(p.lon)<=180;
function setupStop(i){
  const root=document.querySelector('#stop-template').content.firstElementChild.cloneNode(true);
  document.querySelector('#stops').append(root);
  const get=s=>root.querySelector(s),name=i?'Drop-off':'Pickup',letter=i?'B':'A';
  root.dataset.side=letter;get('.eyebrow').textContent='STOP '+letter;get('h2').textContent=name;
  const box=get('.matches'),msg=get('.message'),input=get('input');input.setAttribute('aria-label',name+' location');
  let version=0,controller;
  function reset(){version++;controller?.abort();box.replaceChildren();msg.textContent='';return version}
  function choose(point){
    reset();const other=selected[1-i];if(Math.abs(point.lat-other.lat)<1e-6&&Math.abs(point.lon-other.lon)<1e-6){msg.textContent='Pickup and drop-off must differ.';return}
    selected[i]={...point,name:point.name||name+' pin'};get('.chosen').textContent=selected[i].name+' · '+point.lat.toFixed(5)+', '+point.lon.toFixed(5);draw();
  }
  const draw=attachMap(root,()=>selected[i],choose,letter);choose(selected[i]);
  function results(list){box.replaceChildren();for(const p of list){const b=document.createElement('button');b.textContent=p.name||p.lat+', '+p.lon;b.onclick=()=>choose(p);box.append(b)}}
  input.oninput=reset;
  get('form').onsubmit=async e=>{
    e.preventDefault();const id=reset(),q=input.value.trim(),key=q.toLowerCase(),pair=coordinate(q);
    if(pair){if(valid(pair))choose(pair);else msg.textContent='Coordinates are outside the map coverage.';return}
    if(q.length<3){msg.textContent='Enter at least three characters.';return}
    const local=stops.filter(p=>p.name.toLowerCase().includes(key));
    if(cache.has(key)){results(cache.get(key));msg.textContent='Choose a result.';return}
    results(local);
    if(Date.now()<nextSearch){msg.textContent='Search again in a moment, or drag the pin.';return}
    nextSearch=Date.now()+1100;controller=new AbortController();const request=controller;
    const timer=setTimeout(()=>request.abort(),6000);
    msg.textContent=local.length?'Nearby matches shown. Checking more places…':'Looking up places…';
    try{
      const params=new URLSearchParams({q,format:'jsonv2',limit:'4'});const r=await fetch('https://nominatim.openstreetmap.org/search?'+params,{signal:request.signal});
      if(!r.ok)throw Error();const remote=(await r.json()).map(p=>({lat:+p.lat,lon:+p.lon,name:p.display_name})).filter(valid);
      if(id!==version)return;const list=remote.length?remote:local;if(list.length)cache.set(key,list);
      results(list);msg.textContent=list.length?'Choose a result.':'No matches. Try a landmark or drag the pin.';
    }catch{if(id===version)msg.textContent='Online search unavailable. Choose a local match, drag the pin or enter coordinates.'}
    finally{clearTimeout(timer)}
  };
  get('.gps').onclick=()=>{const id=reset();if(!navigator.geolocation){msg.textContent='GPS unavailable. Drag the pin instead.';return}
    msg.textContent='Finding location…';navigator.geolocation.getCurrentPosition(({coords})=>{if(id!==version)return;
      const point={lat:coords.latitude,lon:coords.longitude,name:'Use current location'};
      if(!valid(point)){msg.textContent='Outside map coverage.';return}results([point]);msg.textContent='Confirm to display your position on the map.';
    },()=>{if(id===version)msg.textContent='GPS unavailable. Drag the pin or search instead.'},{timeout:9000})};
}
export function setupLocations(){
  selected.forEach((_,i)=>setupStop(i));
  document.querySelector('#copy-card').onclick=async()=>{
    const p=selected[0],landmark=document.querySelector('#landmark').value.trim();
    const card=['Meet at '+p.name,landmark,'https://www.openstreetmap.org/?mlat='+p.lat.toFixed(5)+'&mlon='+p.lon.toFixed(5)].filter(Boolean).join('\n');
    const status=document.querySelector('#card-message');try{await navigator.clipboard.writeText(card);status.textContent='Pickup details copied.'}catch{status.textContent=card}
  };
}
