import {access} from '../components/access.js';
import {head,back} from '../ui.js';
import {tripTracker} from '../components/trip-tracker.js';
export async function mount(ctx){
  const {root,api,auth,parts,signal}=ctx;
  if(!api||!auth.signed)return access(ctx,'Live vehicle location','Sign in to follow the vehicle for your confirmed booking.');
  root.innerHTML=back('#/trips','My trips')+head('Your booked ride','Live vehicle location','Available when your driver chooses to share GPS with confirmed passengers.');
  await tripTracker(root,{read:signal=>api.driverLocation(parts[0],parts[1],signal),signal,driver:true});
}
