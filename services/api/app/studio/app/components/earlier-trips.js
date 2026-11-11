import {clock, confirmation, day} from '../ui.js';
import {vehicleBlock} from './ride-summary.js';

export function bindEarlierTrips(ctx, driving, history, button) {
  const {api, root, signal} = ctx;
  const section = root.querySelector('.previous');
  if (!section) return;
  const target = section.querySelector('[data-legacy]');
  let loading = false;

  async function load() {
    if (!section.open || loading) return;
    loading = true;
    target.textContent = 'Loading…';
    try {
      let rides;
      if (ctx.auth.approvals) {
        rides = await api.earlierTrips(driving ? 'driver' : 'passenger', history, signal);
      } else if (driving) {
        rides = await api.unpriced(signal);
      } else {
        const requests = await api.earlierBookings(signal);
        rides = requests.map(r => ({id:r.ride_id, requests:[r]}));
      }
      if (signal.aborted) return;
      target.replaceChildren();
      if (!rides.length) target.textContent = driving ? 'No earlier offers.' : 'No earlier seat requests.';
      for (const ride of rides) {
        const row = document.createElement('article');
        row.className = 'passenger-row';
        const title = document.createElement('b');
        title.textContent = ride.origin ? ride.origin+' → '+ride.destination : 'Ride '+ride.id.slice(0,8);
        row.append(title);
        if (ride.departure_at) {
          const time = document.createElement('small');
          time.textContent = day(ride.departure_at)+' · '+clock(ride.departure_at)+(ride.cancelled?' · Cancelled':'');
          row.append(time);
        }
        const upcoming = !ride.cancelled && Date.parse(ride.departure_at) > Date.now();
        for (const request of ride.requests || []) {
          const group = document.createElement('div');
          group.textContent = 'Request '+request.id.slice(0,8)+' · '+request.status;
          if (upcoming && driving && request.status === 'pending') {
            button(group,'Accept request',async()=>{await api.earlierDecision(request.id,'accept');await load();});
            button(group,'Decline request',async()=>{await api.earlierDecision(request.id,'reject');await load();});
          } else if (upcoming && !driving && ['pending','accepted'].includes(request.status)) {
            button(group,'Cancel seat request',async()=>{
              if (await confirmation('Cancel this request?',title.textContent,'Cancel request')) {
                await api.earlierDecision(request.id,'cancel');
                await load();
              }
            },true);
          }
          row.append(group);
        }
        button(row,'Vehicle & rating',async()=>{
          const detail=await api.oldDetail(ride.id);
          if(signal.aborted)return;
          row.querySelector('.old-detail')?.remove();
          const info = document.createElement('div');
          info.className = 'old-detail';
          info.innerHTML = vehicleBlock(detail);
          row.append(info);
        });
        if (driving && upcoming) button(row,'Cancel earlier ride',async()=>{
          if(await confirmation('Cancel this ride?','This closes its active seat requests.','Cancel ride',{danger:true})){
            await api.oldCancel(ride.id);
            await load();
          }
        },true);
        target.append(row);
      }
    } catch (error) {
      if (!signal.aborted) target.textContent = error.message;
    } finally {
      loading = false;
    }
  }
  section.ontoggle = load;
  root.querySelector('[data-refresh]').addEventListener('click',load);
}
