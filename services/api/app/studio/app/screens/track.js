import {head,esc,clock} from '../ui.js';

export async function mount({root,api,parts,signal}){
  if(!api)throw Error('Trip tracking is unavailable at this address.');
  root.innerHTML=head('Shared with you','Follow a trip','A private link from your traveller.')+
    '<section class="panel sharing-panel"><div data-tracking aria-live="polite">Checking the link…</div><button data-refresh class="btn secondary">Refresh location</button><p class="fine">Updates can pause when the traveller loses signal or backgrounds their browser. Check the update time. This is not emergency monitoring.</p></section>';
  let timer,busy=false,ended=false;
  async function refresh(){
    if(busy||signal.aborted||ended)return;busy=true;
    const node=root.querySelector('[data-tracking]');
    try{
      const data=await api.viewShare(parts[0],signal);if(signal.aborted)return;
      node.innerHTML=`<h2>${esc(data.origin)} → ${esc(data.destination)}</h2><p class="share-state">${data.state==='live'?'Location recently updated':data.state==='stale'?'Updates paused · last known location':'Waiting for the first location update'}</p><p>${data.updated_at?'Last received '+esc(clock(data.updated_at)):'Location has not arrived yet.'} · Link expires ${esc(clock(data.expires_at))}</p>`;
      if(data.position){
        const p=data.position,link=document.createElement('a');link.className='btn primary';link.target='_blank';link.rel='noopener noreferrer';link.textContent='Open last known location on OpenStreetMap';
        link.href='https://www.openstreetmap.org/?mlat='+p.latitude+'&mlon='+p.longitude+'#map=16/'+p.latitude+'/'+p.longitude;
        const accuracy=document.createElement('p');accuracy.className='fine';accuracy.textContent='Location measured '+clock(p.observed_at)+'. Device-reported accuracy: approximately '+Math.round(p.accuracy_m)+' metres. Opening the map shares this position with OpenStreetMap.';
        node.append(link,accuracy);
      }
    }catch(e){if(signal.aborted)return;node.textContent=e.status===410?'This sharing link has ended. Ask your traveller for a new link.':e.message+' Use Refresh location to retry.';if(e.status===410){ended=true;clearInterval(timer);root.querySelector('[data-refresh]').hidden=true;}}
    finally{busy=false;}
  }
  root.querySelector('[data-refresh]').onclick=refresh;await refresh();
  if(!ended&&!signal.aborted)timer=setInterval(()=>{if(!document.hidden)refresh();},10000);
  signal.addEventListener('abort',()=>clearInterval(timer),{once:true});
}
