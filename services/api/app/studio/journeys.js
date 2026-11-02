const el=id=>document.getElementById(id);
const money=p=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'}).format(p/100);
let token=null, version=0;
const tell=text=>{el('journey-status').textContent=text};
function action(parent,label,fn){
  const b=document.createElement('button');b.type='button';b.textContent=label;
  b.onclick=async()=>{b.disabled=true;try{await fn()}catch(e){tell(e.message)}finally{b.disabled=false}};
  parent.append(b);return b;
}
function line(parent,text,tag='p'){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node}
async function api(path,body){
  const options={method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token}};
  if(body!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(body)}
  const r=await fetch('/v1/journeys'+path,options);const data=await r.json();
  if(!r.ok)throw Error(typeof data.detail==='string'?data.detail:'Check the entered journey details.');
  return data;
}
function input(){
  const stops=el('journey-stops').value.trim().split(/\n/).map(row=>{
    const fields=row.split('|').map(x=>x.trim());
    if(fields.length!==3||fields.some(x=>!x))throw Error('Each stop needs a name, cumulative km and minutes.');
    return {name:fields[0],metres:Math.round(Number(fields[1])*1000),minutes:Number(fields[2])};
  });
  if(stops.length<2||stops.length>16||stops[0].metres!==0||stops[0].minutes!==0||
     stops.some((s,i)=>!Number.isSafeInteger(s.metres)||!Number.isSafeInteger(s.minutes)||
       (i&&(s.metres<=stops[i-1].metres||s.minutes<=stops[i-1].minutes))))throw Error('Start at zero km and minutes, then increase both at every stop.');
  const departure=new Date(el('journey-time').value);
  if(!Number.isFinite(+departure)||departure<=new Date())throw Error('Choose a future departure.');
  return {stops,price_paise:Math.round(Number(el('journey-price').value)*100),capacity:Number(el('journey-capacity').value),departure:departure.toISOString()};
}
function picker(parent,caption,stops,value){
  const label=document.createElement('label');label.textContent=caption;
  const select=document.createElement('select');stops.forEach((s,i)=>select.add(new Option(s.name,i)));
  select.value=value;label.append(select);parent.append(label);return select;
}
function draw(list){
 const container=el('journey-list');container.replaceChildren();
 if(!list.length)line(container,'No upcoming offers or tickets yet. You can list the first ride.');
 for(const j of list){
  const box=document.createElement('div');box.className='journey-box';container.append(box);
  line(box,j.stops.map(s=>s.name).join(' → '),'h3');
  line(box,new Date(j.departure).toLocaleString()+' · Full seat '+money(j.price_paise)+(j.cancelled?' · Cancelled':''));
  if(!j.cancelled){
   const controls=document.createElement('div');controls.className='offer-row';box.append(controls);
   const from=picker(controls,'Board at',j.stops,0),to=picker(controls,'Leave at',j.stops,j.stops.length-1);
   const output=line(box,'');let key=crypto.randomUUID();
   function price(){const a=+from.value,b=+to.value;if(a>=b){output.textContent='Choose a later drop-off.';return}
    const cumulative=i=>Math.round(j.price_paise*j.stops[i].metres/j.stops.at(-1).metres);
    const free=Math.min(...j.free.slice(a,b));output.textContent=money(cumulative(b)-cumulative(a))+' per seat · '+free+' available on this segment';
   }
   from.onchange=to.onchange=()=>{key=crypto.randomUUID();price()};price();
   if(token&&!j.owner)action(box,'Reserve segment for checkout',async()=>{
    const ticket=await api('/'+j.id+'/holds',{board:+from.value,alight:+to.value,checkout_id:key});
    tell('Checkout '+ticket.state+' · '+money(ticket.fare_paise)+'. No payment taken at reservation.');await refresh();
   });
   if(token&&j.owner)action(box,'Cancel entire ride',async()=>{
    if(!confirm('Cancel this journey and return the full sandbox charge to each active passenger?'))return;
    await api('/'+j.id+'/cancel',{});tell('Ride cancelled. Active sandbox charges refunded.');await refresh()
   });
  }
  for(const t of j.tickets||[]){
   line(box,j.stops[t.board].name+' → '+j.stops[t.alight].name+' · '+t.state+' · Charged '+money(t.charged_paise)+' · Refunded '+money(t.refund_paise));
   const url='/'+j.id+'/tickets/'+t.id;
   if(t.state==='held'&&!j.owner)action(box,'Pay '+money(t.fare_paise)+' (sandbox)',async()=>{
    const paid=await api(url+'/sandbox-pay',{});tell('Sandbox receipt '+paid.id+' · '+money(paid.charged_paise));await refresh()
   });
   if(['held','paid'].includes(t.state))action(box,j.owner?'Cancel this passenger and fully refund':'Cancel my reservation',async()=>{
    const q=await api('/'+j.id+'/quote',{board:t.board,alight:t.alight});
    const fee=j.owner||!t.charged_paise?0:q.passenger_fee_if_cancelled_now_paise;
    if(!confirm('Current estimated fee '+money(fee)+'. Confirm cancellation?'))return;
    const cancelled=await api(url+'/cancel',{});tell('Reservation '+cancelled.state+'. Refund '+money(cancelled.refund_paise));await refresh()
   });
   if(j.owner&&t.state==='paid'&&t.alight-t.board>1){
    const early=picker(box,'Actual exit stop',j.stops.slice(t.board+1,t.alight),0);
    action(box,'Confirm passenger got out',async()=>{
     const stop=t.board+1+Number(early.value);
     if(!confirm('Confirm this passenger has left at '+j.stops[stop].name+'?'))return;
     const changed=await api(url+'/exit',{stop});tell('Unused segment released. Sandbox refund '+money(changed.refund_paise));await refresh()
    });
   }
  }
 }
}
async function refresh(){
 const current=++version;
 const [offers,mine]=await Promise.all([api(''),api('/mine')]);
 if(current===version)draw([...new Map([...offers,...mine].map(j=>[j.id,j])).values()]);
}
export function setupJourneys(){
 const time=new Date(Date.now()+86400000);time.setMinutes(time.getMinutes()-time.getTimezoneOffset());el('journey-time').value=time.toISOString().slice(0,16);
 function preview(j){draw([{...j,free:j.stops.slice(1).map(()=>j.capacity)}])}
 preview(input());
 el('journey-offer').onsubmit=async e=>{e.preventDefault();const button=el('journey-publish');button.disabled=true;
 try{const data=input();if(token){await api('',data);await refresh();tell('Your ride is listed.')}else{preview(data);tell('Preview updated. Use the signed-in studio to publish.')}}catch(e){tell(e.message)}finally{button.disabled=false}};
 el('journey-reload').onclick=()=>refresh().catch(e=>tell(e.message));
}
export function connectJourneys(accessToken){
 token=accessToken;el('journey-list').replaceChildren();el('journey-mode').textContent='Signed-in shared inventory · sandbox payments only.';
 el('journey-publish').textContent='List my ride';el('journey-reload').hidden=false;
 refresh().catch(e=>tell(e.message));
}
