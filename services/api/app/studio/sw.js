/* No API responses, tokens, chat text or location data are cached. */
const scope=new URL(self.registration.scope);
const dbName='cc-notifications:'+scope.pathname;
let work=Promise.resolve();
function serial(task){const next=work.then(task);work=next.catch(()=>{});return next;}
async function state(change) {
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open(dbName,1);
    request.onupgradeneeded=()=>request.result.createObjectStore('settings');
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
  });
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('settings',change?'readwrite':'readonly');
    const store=tx.objectStore('settings');const request=store.get('push');let result;
    request.onsuccess=()=>{result=request.result||{};if(change){result=change(result);store.put(result,'push');}};
    tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('message',event=>{
  if(event.data?.type!=='cc:binding' || !event.source?.url?.startsWith(scope.href))return;
  event.waitUntil(serial(async()=>{
    try {
      const {value,expected}=event.data;
      if(value!==null && !/^[0-9a-f-]{36}$/.test(value))throw Error('Invalid binding');
      let applied=false;
      await state(previous=>{
        if(expected && previous.binding!==expected)return previous;
        applied=true;return previous.binding===value?previous:{binding:value,seen:[]};
      });
      if(applied)for(const notification of await self.registration.getNotifications())notification.close();
      event.ports[0]?.postMessage({ok:true,applied});
    }catch{event.ports[0]?.postMessage({ok:false});}
  }));
});
self.addEventListener('push',event=>event.waitUntil(serial(async()=>{
  let data;try{data=event.data.json();}catch{return;}
  const current=await state();
  if(!current.binding || data.binding!==current.binding || current.seen?.includes(data.message_id) ||
      !/^#\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(data.path))return;
  const clients=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const ours=clients.filter(client=>client.url.startsWith(scope.href));
  const inChat=ours.some(client=>client.visibilityState==='visible' && new URL(client.url).hash===data.path);
  if(!inChat)await self.registration.showNotification('New CommuteCircle message',{
    body:'Open your private booking chat to reply.', tag:data.tag,
    icon:new URL('icons/icon-192.png',scope).href,badge:new URL('icons/badge.png',scope).href,
    data:{path:data.path,binding:data.binding},renotify:true,
  });
  await state(previous=>previous.binding===data.binding?{...previous,seen:[...(previous.seen||[]),data.message_id].slice(-100)}:previous);
  for(const client of ours)client.postMessage({type:'cc:message',message_id:data.message_id,notified:!inChat});
})));
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil(serial(async()=>{
    const current=await state();const data=event.notification.data;
    if(!current.binding || current.binding!==data?.binding || !/^#\/chat\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/.test(data.path))return;
    const url=new URL(data.path,scope).href;
    for(const client of await self.clients.matchAll({type:'window',includeUncontrolled:true})) {
      if(client.url.startsWith(scope.href)){await client.navigate(url);await client.focus();return;}
    }
    await self.clients.openWindow(url);
  }));
});
self.addEventListener('fetch',event=>{
  if(event.request.mode!=='navigate' || !event.request.url.startsWith(scope.href))return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>CommuteCircle · Offline</title><style>body{font:18px system-ui;background:#f5f7fc;color:#14213d;max-width:32rem;margin:15vh auto;padding:24px}a{color:#2457d6}</style><h1>You’re offline</h1><p>Reconnect to see current rides and messages. Your booking has not been changed.</p><a href="./">Try again</a>',
    {headers:{'Content-Type':'text/html; charset=utf-8'}})));
});
