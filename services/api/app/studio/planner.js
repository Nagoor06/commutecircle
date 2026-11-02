import {setupLocations} from './locations.js?rev=3';
import {change,available} from './model.mjs';
import {vehicleCard} from './vehicle.js';
import {setupLive} from './session.js?rev=3';
setupLocations();
vehicleCard({make:'Honda',model:'City',color:'Pearl white',purchased_on:'2022-06-12',condition:'Good'},{average:null,count:0},'Sample vehicle');
const el=id=>document.getElementById(id),names=['Anu','Ravi'];let states=['idle','idle'], closed=false;
function render(){
 el('seat').textContent=(closed?'Ride cancelled':available(states)+' / 1 seat available');el('riders').replaceChildren();
 states.forEach((state,i)=>{const row=document.createElement('div');row.className='rider';
 const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=names[i][0];
 const who=document.createElement('b');who.textContent=names[i]+' · '+state+(state==='accepted'?' · ₹20 demo hold':'');
 const controls=document.createElement('div');controls.className='actions';row.append(avatar,who,controls);
 const actions={idle:['request'],pending:['approve','cancel'],accepted:['cancel'],cancelled:[]};
 for(const action of (closed?[]:actions[state])){const button=document.createElement('button');button.textContent={request:'Request · ₹20 demo commitment',approve:'Driver: approve',cancel:'Cancel'}[action];button.onclick=()=>{const success=change(states,i,action);render();el('feedback').textContent=success?names[i]+' · '+states[i]:'No seat available. The request was not approved.'};controls.append(button)}
 el('riders').append(row)});
}
el('reset').onclick=()=>{closed=false;states=['idle','idle'];el('feedback').textContent='';render()};render();setupLive();

el('cancel-trip').onclick=()=>{
 closed=true;states=states.map(s=>['pending','accepted'].includes(s)?'cancelled':s);
 render();el('feedback').textContent='Ride cancelled. All active requests closed and any demo hold released.';
};
