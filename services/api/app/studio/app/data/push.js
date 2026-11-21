const base=new URL('./',document.baseURI);
const key='cc:push:'+base.href;
const supported=()=>isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const read=()=>{try{return JSON.parse(localStorage.getItem(key)) || {};}catch{return {};}};
const write=value=>localStorage.setItem(key,JSON.stringify(value));
let registration;
function register(){return registration ||= navigator.serviceWorker.register(new URL('sw.js',base),{scope:base.pathname,updateViaCache:'none'}).then(async reg=>{
  if(!reg.active)await new Promise((resolve,reject)=>{
    const worker=reg.installing||reg.waiting;
    if(!worker)return reject(Error('Could not start notifications. Please refresh.'));
    const timer=setTimeout(()=>reject(Error('Notifications took too long to start. Try again.')),10000);
    worker.addEventListener('statechange',()=>{if(worker.state==='activated'){clearTimeout(timer);resolve();}else if(worker.state==='redundant'){clearTimeout(timer);reject(Error('Refresh to update notifications.'));}});
  });
  return reg;
}).catch(error=>{registration=null;throw error;});}
async function bind(reg,value,expected) {
  const worker=reg.active;
  if(!worker)throw Error('Refresh to finish enabling notifications.');
  return await new Promise((resolve,reject)=>{
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();reject(Error('Could not update notification privacy settings.'));},4000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();event.data?.ok?resolve(event.data.applied):reject(Error('Notification storage is unavailable.'));};
    worker.postMessage({type:'cc:binding',value,expected},[channel.port2]);
  });
}
function decode(value){return Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));}

export function createPushSettings(api,auth) {
  let busy=false;
  const lock=operation=>navigator.locks?navigator.locks.request(key,operation):operation();
  const current=()=>!!auth.token && (!auth.store || auth.store.read().id===auth.record.id);
  async function turnOff(expected=read().binding) {
    if(!supported())return;
    if(auth.store && auth.store.read().id!==auth.record.id)return;
    const saved=read();
    if(saved.binding!==expected)return;
    const reg=await register();
    if(!await bind(reg,null,saved.binding))return;
    // Only remove our generation; another tab may have already signed in again.
    if(read().binding===saved.binding)write({});
    const sub=await reg.pushManager.getSubscription();
    if(sub) {
      const request=api?.disablePush(sub.endpoint).catch(()=>{});
      await sub.unsubscribe();
      void request;
    }
  }
  async function turnOn({restore=false,permission}={}) {
    if(busy)return;
    if(!supported())throw Error('This browser cannot show phone notifications. In-app alerts are available.');
    if(!current())throw Error('Sign in to enable notifications.');
    busy=true;
    let reg,sub;
    try {
      const config=await api.pushConfig();
      if(!config.available)throw Error('Phone notifications are not configured yet. In-app alerts are available.');
      // Permission prompts only follow a deliberate click, never page load.
      if(Notification.permission!=='granted') {
        if(restore)return;
        if(await permission!=='granted')throw Error('Notifications are blocked. You can allow them in browser or app settings.');
      }
      if(!current())return;
      reg=await register();
      sub=await reg.pushManager.getSubscription();
      const saved=read();
      if(restore && (!saved.binding || saved.account!==auth.record.account || !sub))return;
      if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decode(config.public_key)});
      if(!current()){await sub.unsubscribe();return;}
      const value={account:auth.record.account,binding:saved.account===auth.record.account && saved.binding?saved.binding:crypto.randomUUID()};
      const json=sub.toJSON();
      await api.enablePush({endpoint:json.endpoint,keys:json.keys,binding:value.binding});
      if(!current()){await sub.unsubscribe();return;}
      write(value);await bind(reg,value.binding);
    } catch(error) {
      if(sub && current()) {
        await turnOff().catch(()=>{});
      }
      throw error;
    } finally {busy=false;}
  }
  const disable=()=>{const expected=read().binding;return lock(()=>turnOff(expected));};
  const enable=()=>{
    // Request during the click gesture, before waiting for the network or another tab.
    const permission=supported() && Notification.permission!=='granted'?Notification.requestPermission():Promise.resolve('granted');
    return lock(()=>turnOn({permission}));
  };
  async function restore() {
    if(!supported())return;
    const saved=read();
    if(saved.binding && (!auth.record?.account || saved.account!==auth.record.account))await disable();
    else if(saved.binding && !current())return;
    else if(saved.binding && Notification.permission==='granted')await lock(()=>turnOn({restore:true}));
    else if(saved.binding)await disable();
    else await register();
  }
  return {enable,disable,restore,supported,
    enabled:()=>supported() && Notification.permission==='granted' && read().account===auth.record?.account && !!read().binding};
}
