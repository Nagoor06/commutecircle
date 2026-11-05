import {head} from '../ui.js';
import {tripTracker} from '../components/trip-tracker.js';
export async function mount({root,api,parts,signal}){
  if(!api)throw Error('Trip tracking is unavailable at this address.');
  root.innerHTML=head('Shared with you','Follow a trip','Live location, shared privately by your traveller.');
  await tripTracker(root,{read:signal=>api.viewShare(parts[0],signal),signal});
}
