import {requestId} from '../data/id.js';
import {dateTimeInput,notice,pending} from '../ui.js';
import {knownPlace,normal,finitePlace} from '../data/places.js';
import {attachField} from '../components/place-field.js';
import {offerForm,offerReview,stopRow} from '../components/offer-form.js';

function newDraft(route){
  return {
    key:requestId(),
    stops:route.map((p,i)=>({...p,km:i?'':0,minutes:i?'':0})),
    time:dateTimeInput(new Date(Date.now()+86400000)),
    price:'',seats:1,withCar:false,car:{condition:'good'}
  };
}

function readOffer(draft){
  const departure=new Date(draft.time);
  if(!Number.isFinite(+departure)||+departure<=Date.now())throw Error('Choose a future departure time.');
  const stops=draft.stops.map(stop=>{
    const name=stop.name.trim(), point=finitePlace(stop)?stop:knownPlace(name);
    if(!name)throw Error('Give every stop a public meeting place.');
    return {name,metres:Math.round(Number(stop.km)*1000),minutes:Number(stop.minutes),
      ...(point?{lat:point.lat,lon:point.lon}:{})};
  });
  for(let i=1;i<stops.length;i++){
    if(stops[i].metres<=stops[i-1].metres||stops[i].minutes<=stops[i-1].minutes)throw Error('Distance and time must increase at stop '+(i+1)+'.');
    if(normal(stops[i].name)===normal(stops[i-1].name))throw Error('Adjacent stops need different names.');
  }
  return {offer_id:draft.key,stops,departure:departure.toISOString(),capacity:Number(draft.seats),
    price_paise:Math.round(Number(draft.price)*100),...(draft.withCar?{vehicle:{...draft.car}}:{})};
}

function review(ctx,draft){
  const {root,api,auth,state,signal,go}=ctx, offer=draft.ready;
  const title=api?'Publish ride':auth.enabled?'Sign in to publish':'Publishing unavailable';
  root.innerHTML=offerReview(offer,title);
  const publish=root.querySelector('[data-publish]');
  if(!api){
    if(auth.enabled){
      publish.onclick=()=>{
        try{sessionStorage.setItem('cc:offer-signin',JSON.stringify({draft,until:Date.now()+1800000}))}catch{}
        auth.login();
      };
    }else{
      publish.disabled=true;notice(root,auth.problem||'The booking service is unavailable.');
    }
    return;
  }
  publish.onclick=()=>pending(publish,async()=>{
    if(Date.parse(offer.departure)<=Date.now())throw Error('Departure has passed. Edit the time before publishing.');
    await api.publish(offer);
    state.offer=null;
    if(!signal.aborted)go('trips?view=driving');
  },message=>notice(root,message,'error'));
}

export function mount(ctx){
  const {root,state,signal,geocoder,query,go}=ctx;
  const d=state.offer||(state.offer=newDraft(state.route));
  if(query.get('step')==='review'&&d.ready){review(ctx,d);return}
  root.innerHTML=offerForm(d);
  const form=root.querySelector('[data-offer-form]');
  const rows=root.querySelector('[data-stops]');
  const car=root.querySelector('[data-car]');
  function carFields(){
    car.hidden=!d.withCar;
    for(const field of car.querySelectorAll('input,select')){field.disabled=!d.withCar;field.required=d.withCar}
  }
  function summary(){
    root.querySelector('[data-summary]').textContent=(d.stops[0].name||'Pickup')+' → '+(d.stops.at(-1).name||'Drop-off');
  }
  let rowScope;
  signal.addEventListener('abort',()=>rowScope?.abort(),{once:true});
  function drawStops(){
    rowScope?.abort();rowScope=new AbortController();
    rows.innerHTML=d.stops.map((s,i)=>stopRow(s,i,d.stops.length)).join('');
    rows.querySelectorAll('.place-field').forEach((node,i)=>{
      const input=node.querySelector('input');
      input.required=true;input.maxLength=80;input.dataset.value='name';
      attachField(node,{initial:{...d.stops[i]},geocoder,signal:rowScope.signal,info:m=>notice(root,m),
        onDraft:()=>{},update:place=>{Object.assign(d.stops[i],place);d.ready=null;summary()}});
    });
    root.querySelector('[data-add-stop]').disabled=d.stops.length>=16;
    rows.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{
      d.stops.splice(Number(b.dataset.remove),1);d.ready=null;drawStops();summary();
    });
  }
  root.querySelector('[data-add-stop]').onclick=()=>{
    d.stops.splice(-1,0,{name:'',km:'',minutes:''});d.ready=null;drawStops();
    rows.querySelectorAll('[data-value=name]')[d.stops.length-2].focus();
  };
  form.oninput=event=>{
    const field=event.target;d.ready=null;
    if(field.dataset.value){
      const stop=d.stops[Number(field.closest('[data-row]').dataset.row)];
      stop[field.dataset.value]=field.value;
      if(field.dataset.value==='name'){delete stop.lat;delete stop.lon;delete stop.area}
      summary();
    }else if(field.name==='withCar'){
      d.withCar=field.checked;carFields();
    }else if(car.contains(field)){
      d.car[field.name]=field.value;
    }else if(field.name){
      d[field.name]=field.value;
    }
  };
  form.onsubmit=e=>{
    e.preventDefault();
    try{d.ready=readOffer(d);go('offer?step=review')}
    catch(error){notice(root,error.message,'error')}
  };
  drawStops();summary();carFields();
}
