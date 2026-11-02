import {setupLocations} from './locations.js';
import {change,available} from './model.mjs';
import {vehicleCard} from './vehicle.js';
import {setupLive} from './session.js';
setupLocations();
vehicleCard({make:'Honda',model:'City',color:'Pearl white',purchased_on:'2022-06-12',condition:'Good'},{average:null,count:0},'Sample vehicle');
const el=id=>document.getElementById(id),names=['Anu','Ravi'];let states=['idle','idle'];
function render(){
 el('seat').textContent=available(states)+' / 1 seat available';el('riders').replaceChildren();
 states.forEach((state,i)=>{const row=document.createElement('div');row.className='rider';
 const avatar=document.createElement('span');avatar.className='avatar';avatar.textContent=names[i][0];
 const who=document.createElement('b');who.textContent=names[i]+' · '+state;
 const controls=document.createElement('div');controls.className='actions';row.append(avatar,who,controls);
 const actions={idle:['request'],pending:['approve','cancel'],accepted:['cancel'],cancelled:[]};
 for(const action of actions[state]){const button=document.createElement('button');button.textContent={request:'Request seat',approve:'Driver: approve',cancel:'Cancel'}[action];button.onclick=()=>{const success=change(states,i,action);render();el('feedback').textContent=success?names[i]+' · '+states[i]:'No seat available. The request was not approved.'};controls.append(button)}
 el('riders').append(row)});
}
el('reset').onclick=()=>{states=['idle','idle'];el('feedback').textContent='';render()};render();setupLive();
