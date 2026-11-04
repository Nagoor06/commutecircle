// One opt-in GPS watch per app tab. Tokens remain in memory and in the link the
// traveller deliberately shares; coordinates are never sent to chat or AI.
export function createTripSharing(api, notify) {
  let current=null, watch, expiry, poll, sequence=0, version=0, lastSent=0, sending=false;
  const listeners=new Set();
  function announce(){ notify(current); for(const listener of listeners)listener(current); }
  function clear(){ if(watch!=null)navigator.geolocation.clearWatch(watch);watch=null;clearTimeout(expiry);clearInterval(poll); }
  async function stop(unloading=false){
    const old=current;version++;clear();current=null;announce();
    if(old)try{await api.stopShare(old.id,unloading);}catch(error){
      if(!unloading)throw Error('Device tracking stopped. The server could not confirm revocation; the link ends after five minutes without updates.');
    }
  }
  async function start(journey_id,ticket_id){
    if(!navigator.geolocation)throw Error('Location is unavailable on this device.');
    await stop();const generation=++version;
    const result=await api.startShare({journey_id,...(ticket_id?{ticket_id}:{})});
    if(generation!==version){await api.stopShare(result.id);return;}
    current={...result,journey_id,ticket_id,status:'Waiting for device location…',updated_at:null};
    sequence=0;lastSent=0;sending=false;announce();
    function deadline(){
      clearTimeout(expiry);
      expiry=setTimeout(()=>stop().catch(()=>{}),Math.max(0,Math.min(Date.parse(result.expires_at),Date.now()+5*60*1000)-Date.now()));
    }
    deadline();
    const received=async position=>{
      if(generation!==version||sending||Date.now()-lastSent<10000)return;
      sending=true;lastSent=Date.now();
      try{
        const response=await api.locateShare(result.id,{latitude:position.coords.latitude,longitude:position.coords.longitude,
          accuracy_m:position.coords.accuracy,observed_at:new Date(position.timestamp).toISOString(),sequence:++sequence});
        if(generation!==version)return;
        if(response.accepted){current.updated_at=response.updated_at;current.status='Location sharing is on';deadline();announce();}
      }catch(error){
        if(generation!==version)return;
        if([401,403,404,410].includes(error.status)){await stop().catch(()=>{});return;}
        current.status='Update failed. Keep this page open; location will retry.';announce();
      }finally{if(generation===version)sending=false;}
    };
    const failed=error=>{
      if(generation!==version)return;
      if(error.code===1){
        stop().catch(()=>{});
        notify(null,'Location permission denied. Sharing stopped. Allow location in your browser before trying again.');
        return;
      }
      current.status='Location signal unavailable. Your contact sees the last update time.';announce();
    };
    const options={enableHighAccuracy:true,maximumAge:0,timeout:15000};
    watch=navigator.geolocation.watchPosition(received,failed,options);
    // Request a fresh fix even while stationary. Never re-send a cached point as a new update.
    poll=setInterval(()=>{if(!document.hidden&&generation===version)navigator.geolocation.getCurrentPosition(received,failed,options);},20000);
  }
  window.addEventListener('pagehide',()=>{stop(true).catch(()=>{});});
  return {start,stop,get current(){return current;},subscribe(listener){listeners.add(listener);listener(current);return()=>listeners.delete(listener);}};
}
