export function available(states){return 1-states.filter(s=>s==='accepted').length}
export function change(states,i,action){
  const old=states[i];
  if(action==='request' && old==='idle' && available(states)) states[i]='pending';
  else if(action==='approve' && old==='pending' && available(states)) states[i]='accepted';
  else if(action==='cancel' && ['pending','accepted'].includes(old)) states[i]='cancelled';
  else return false;
  return true;
}
