import {distance, finitePlace, normal} from './places.js';
import {publicStops} from './public-stops.js';

async function route(points,signal) {
  const controller = new AbortController(), abort = ()=>controller.abort();
  if(signal.aborted)abort();else signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,12000);
  try {
    const coordinates=points.map(p=>p.lon.toFixed(5)+','+p.lat.toFixed(5)).join(';');
    const response=await fetch('https://router.project-osrm.org/route/v1/driving/'+coordinates+'?overview=full&geometries=geojson&steps=false',{signal:controller.signal});
    if(!response.ok)throw Error();
    const data=await response.json(),result=data.routes?.[0];
    if(data.code!=='Ok'||!result||result.legs?.length!==points.length-1||!result.geometry?.coordinates?.length)throw Error();
    return result;
  } catch(error){
    if(signal.aborted)throw error;
    throw Error('Road routing is unavailable. Retry, or enter measured distance and time for every stop.');
  }finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}

// Project public catalogue points onto the driving geometry. These are candidate
// stops only; a second route goes through each chosen stop before pricing it.
function projection(point,geometry) {
  let travelled=0,best={gap:Infinity,along:0};
  for(let i=1;i<geometry.length;i++){
    const a={lon:geometry[i-1][0],lat:geometry[i-1][1]},b={lon:geometry[i][0],lat:geometry[i][1]};
    const scale=Math.cos(point.lat*Math.PI/180),dx=(b.lon-a.lon)*scale,dy=b.lat-a.lat;
    const t=Math.max(0,Math.min(1,((point.lon-a.lon)*scale*dx+(point.lat-a.lat)*dy)/(dx*dx+dy*dy||1)));
    const foot={lat:a.lat+t*(b.lat-a.lat),lon:a.lon+t*(b.lon-a.lon)},gap=distance(point,foot),length=distance(a,b);
    if(gap<best.gap)best={gap,along:travelled+t*length};travelled+=length;
  }
  return best;
}

export async function calculateRoute(stops, includePublic, signal) {
  if(!stops.every(finitePlace))throw Error('Choose mapped suggestions or pins for every stop before calculating the road route.');
  let points=stops.map(s=>({...s})),result=await route(points,signal);
  if(includePublic&&points.length===2){
    const geometry=result.geometry.coordinates;
    const lats=geometry.map(c=>c[1]),lons=geometry.map(c=>c[0]);
    const bounds=[Math.min(...lats)-.02,Math.max(...lats)+.02,Math.min(...lons)-.02,Math.max(...lons)+.02];
    const candidates=(await publicStops(signal)).filter(p=>p.lat>=bounds[0]&&p.lat<=bounds[1]&&p.lon>=bounds[2]&&p.lon<=bounds[3])
      .filter(p=>points.every(s=>normal(s.name)!==normal(p.name)&&distance(s,p)>1500))
      .map(p=>({p,...projection(p,geometry)})).filter(x=>x.gap<=1500).sort((a,b)=>a.along-b.along);
    const chosen=[];
    for(const c of candidates){if(chosen.length>=12)break;if(chosen.every(x=>Math.abs(x.along-c.along)>2500))chosen.push(c);}
    if(chosen.length){points=[points[0],...chosen.map(x=>x.p),points[1]];result=await route(points,signal);}
  }
  let metres=0,minutes=0;
  return points.map((point,i)=>{
    if(i){
      const leg=result.legs[i-1];
      if(!Number.isFinite(leg.distance)||!Number.isFinite(leg.duration)||leg.distance<=0||leg.duration<=0)throw Error('Two stops are too close. Choose distinct public meeting places.');
      metres+=Math.max(1,Math.round(leg.distance));minutes+=Math.max(1,Math.ceil(leg.duration/60));
    }
    return {...point,km:metres/1000,minutes};
  });
}
