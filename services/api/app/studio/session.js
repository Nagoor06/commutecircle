import {vehicleCard} from './vehicle.js';
const el=id=>document.getElementById(id);
const key='cc-pkce';
const base64url=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
const random=()=>base64url(crypto.getRandomValues(new Uint8Array(32)));
export async function setupLive(){
 // The standalone Pages build has no API. The API hosts this same client at /studio/.
 if(location.pathname!='/studio/')return;
 const redirect=location.origin+'/studio/';
 try{
 const config=await fetch('/v1/studio-config').then(r=>r.json());
 if(!config.issuer||!config.client_id)return;
 el('live').hidden=false;
 el('login').onclick=async()=>{try{
 const verifier=random(),state=random();const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier));
 sessionStorage.setItem(key,JSON.stringify({verifier,state}));
 const url=new URL('authorize',config.issuer);url.search=new URLSearchParams({client_id:config.client_id,response_type:'code',redirect_uri:redirect,audience:config.audience,scope:'openid rides:read rides:write',state,code_challenge:base64url(hash),code_challenge_method:'S256'});location.assign(url)
 }catch{el('authStatus').textContent='Sign-in could not start. Use HTTPS or localhost.'}};
 const query=new URLSearchParams(location.search);
 if(!query.has('code')&&!query.has('error'))return;
 history.replaceState(null,'',redirect);const saved=JSON.parse(sessionStorage.getItem(key)||'null');sessionStorage.removeItem(key);
 if(query.has('error')||!saved||saved.state!==query.get('state'))throw Error();
 const result=await fetch(new URL('oauth/token',config.issuer),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({grant_type:'authorization_code',client_id:config.client_id,code:query.get('code'),code_verifier:saved.verifier,redirect_uri:redirect})});
 if(!result.ok)throw Error();const {access_token:token}=await result.json();if(!token)throw Error();
 const api=async path=>{const r=await fetch(path,{headers:{Authorization:'Bearer '+token}});if(!r.ok)throw Error();return r.json()};
 el('translate-panel').hidden=false;
 el('translate-note').onclick=async()=>{
   const landmark=el('landmark').value.trim(),status=el('translation');
   if(!landmark){status.textContent='Enter a public landmark first.';return}
   const button=el('translate-note');button.disabled=true;status.textContent='Translating…';
   try{
     const r=await fetch('/v1/meeting-notes/translate',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({landmark,language:el('language').value})});
     if(!r.ok)throw Error();status.textContent='Review translation: '+(await r.json()).translation;
   }catch{status.textContent='Translation unavailable. You can still copy the original meeting card.'}
   finally{button.disabled=false}
 };
 const rides=await api('/v1/rides/mine');
 el('authStatus').textContent=rides.length?'Choose a ride to view its vehicle and driver reviews.':'No rides offered on this account yet.';
 for(const ride of rides){const button=document.createElement('button');button.textContent='Ride · '+new Date(ride.departure_at).toLocaleString();button.onclick=async()=>{try{const details=await api('/v1/rides/'+encodeURIComponent(ride.id)+'/details');vehicleCard(details.vehicle,details.driver_rating,details.cancelled?'Cancelled ride':'Your ride');el('carTitle').scrollIntoView()}catch{el('authStatus').textContent='Could not load this ride. Sign in and try again.'}};el('owned').append(button);
 const cancel=document.createElement('button');cancel.textContent='Cancel this entire ride';
 cancel.onclick=async()=>{
   if(!window.confirm('Cancel this ride and all pending and accepted bookings?'))return;
   cancel.disabled=true;
   try{const response=await fetch('/v1/rides/'+encodeURIComponent(ride.id)+'/cancel',{method:'POST',headers:{Authorization:'Bearer '+token}});
     if(!response.ok)throw Error();cancel.textContent='Ride cancelled';el('authStatus').textContent='All active bookings on this ride were cancelled.';
   }catch{cancel.disabled=false;el('authStatus').textContent='Cancellation was not confirmed. Refresh the ride details and retry.'}
 };
 el('owned').append(cancel)}
 el('login').textContent='End this app session';el('login').onclick=()=>location.replace(redirect);
 }catch{el('authStatus').textContent='Could not load your signed-in rides. Check the Auth0 callback and web origin, then sign in again.'}
}
