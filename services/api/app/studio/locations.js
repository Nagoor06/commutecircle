import {renderStreets} from './street-map.js';
const osm='https://www.openstreetmap.org';
const places=[
  {name:'Tenali Junction area',lat:16.243,lon:80.640},
  {name:'Tenali bus stand area',lat:16.248,lon:80.650}
];
export const selected=[...places];
const el=id=>document.getElementById(id);
let sequence=0, lastSearch=0, zoom=16, visibleSide=0;
function pin(i){
 const p=selected[i];visibleSide=i;renderStreets(p,i,zoom);
 el('external').href=osm+'/?mlat='+p.lat+'&mlon='+p.lon+'#map=16/'+p.lat+'/'+p.lon;
 el('maptitle').textContent=(i?'Drop-off':'Pickup')+' area';
 el('aName').textContent=selected[0].name;el('bName').textContent=selected[1].name;
}
function valid(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=85&&Math.abs(lon)<=180}
function show(list,side){
 const box=el('results');box.replaceChildren();
 for(const p of list){const button=document.createElement('button');button.textContent='Select · '+p.name;button.onclick=()=>{
 const other=selected[1-side];if(p.lat===other.lat&&p.lon===other.lon){el('notice').textContent='Choose two different stops.';return}
 selected[side]=p;pin(side);box.replaceChildren();el('notice').textContent='Selected '+p.name;};box.append(button)}
}
export function setupLocations(){
 const side=()=>Number(el('side').value);
 el('side').onchange=()=>{sequence++;show([],side());el('notice').textContent='';pin(side())};
 el('showA').onclick=()=>pin(0);el('showB').onclick=()=>pin(1);
 el('gps').onclick=()=>{const attempt=++sequence, target=side();show([],target);
 if(!navigator.geolocation){el('notice').textContent='Location unavailable. Enter a place or coordinates.';return}
 el('notice').textContent='Finding your location…';
 navigator.geolocation.getCurrentPosition(({coords})=>{if(attempt!==sequence)return;
 if(!valid(coords.latitude,coords.longitude)){el('notice').textContent='Outside the street map coverage.';return}
 show([{name:'Current location',lat:coords.latitude,lon:coords.longitude}],target);
 el('notice').textContent='Confirm to display your location on OpenStreetMap.'},()=>{if(attempt===sequence)el('notice').textContent='Location unavailable. Enter a place or coordinates.'},{timeout:12000})};
 el('search').onsubmit=async e=>{e.preventDefault();const attempt=++sequence,target=side(),q=el('query').value.trim();show([],target);
 const pair=q.match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
 if(pair){const lat=Number(pair[1]),lon=Number(pair[2]);if(!valid(lat,lon)){el('notice').textContent='Enter latitude within ±85° and longitude within ±180°.';return}
 show([{name:q,lat,lon}],target);el('notice').textContent='Confirm the pin below.';return}
 if(q.length<3){el('notice').textContent='Enter at least three characters.';return}
 if(Date.now()-lastSearch<1500){el('notice').textContent='Wait a moment before searching again.';return}
 lastSearch=Date.now();el('notice').textContent='Searching places…';
 try{const url=new URL('https://nominatim.openstreetmap.org/search');url.search=new URLSearchParams({q,format:'jsonv2',limit:'4'});
 const response=await fetch(url,{signal:AbortSignal.timeout(9000)});if(!response.ok)throw Error();
 const list=(await response.json()).map(p=>({name:p.display_name,lat:+p.lat,lon:+p.lon})).filter(p=>valid(p.lat,p.lon));
 if(attempt!==sequence)return;show(list,target);el('notice').textContent=list.length?'Choose a matching result.':'No matches. Try a landmark or coordinates.';
 }catch{if(attempt!==sequence)return;const matches=places.filter(p=>p.name.toLowerCase().includes(q.toLowerCase()));show(matches,target);el('notice').textContent='Online search unavailable. Use coordinates, GPS or a matching suggested area.'}};
 el('closer').onclick=()=>{zoom=Math.min(19,zoom+1);pin(visibleSide)};
 el('wider').onclick=()=>{zoom=Math.max(3,zoom-1);pin(visibleSide)};
 new ResizeObserver(()=>pin(visibleSide)).observe(el('street'));
 pin(0);
}
