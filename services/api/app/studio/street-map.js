const limit = (n,min,max) => Math.max(min,Math.min(max,n));
export function project({lat,lon}, zoom) {
  const width = 256 * 2 ** zoom;
  return [(lon+180)/360*width,(1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*width];
}
export function offset(point, dx, dy, zoom) {
  const [x,y] = project(point,zoom), width = 256 * 2 ** zoom;
  return {lon:((x+dx)/width*360%360+360)%360-180,
    lat:limit(Math.atan(Math.sinh(Math.PI*(1-2*limit(y+dy,0,width)/width)))*180/Math.PI,-85,85)};
}
export function attachMap(root, get, select, letter) {
  const tiles=root.querySelector('.tiles'), pin=root.querySelector('.handle');
  let zoom=15, start=null, lastKey='';
  function draw(){
    const point=get(), w=tiles.clientWidth,h=tiles.clientHeight;
    const key=[point.lat,point.lon,w,h,zoom].join('/');
    if(!w||!h||key===lastKey)return;
    lastKey=key;
    const [x,y]=project(point,zoom),left=x-w/2,top=y-h/2,n=2**zoom;
    const fragment=document.createDocumentFragment();
    for(let ty=Math.floor(top/256);ty*256<top+h;ty++){
      if(ty<0||ty>=n)continue;
      for(let tx=Math.floor(left/256);tx*256<left+w;tx++){
        const img=document.createElement('img');
        img.alt='';img.draggable=false;img.style.left=Math.round(tx*256-left)+'px';img.style.top=Math.round(ty*256-top)+'px';
        img.src='https://tile.openstreetmap.org/'+zoom+'/'+((tx%n+n)%n)+'/'+ty+'.png';
        img.onerror=()=>{if(img.isConnected) root.querySelector('.message').textContent='Some map tiles are unavailable. Search or enter coordinates to continue.'};
        fragment.append(img);
      }
    }
    tiles.replaceChildren(fragment);
  }
  pin.textContent=letter;pin.setAttribute('aria-label','Move '+(letter==='A'?'pickup':'drop-off')+' pin');
  function delta(e){
    const frame=tiles.getBoundingClientRect();
    return [limit(e.clientX-start.x,-frame.width/2,frame.width/2),limit(e.clientY-start.y,-frame.height/2,frame.height/2)];
  }
  pin.onpointerdown=e=>{if(!e.isPrimary||e.button!==0)return;start={x:e.clientX,y:e.clientY};pin.setPointerCapture(e.pointerId)};
  pin.onpointermove=e=>{if(start){const [dx,dy]=delta(e);pin.style.translate=dx+'px '+dy+'px'}};
  pin.onpointerup=e=>{if(!start)return;const [dx,dy]=delta(e);start=null;pin.style.translate='';
    if(dx||dy)select(offset(get(),dx,dy,zoom));};
  pin.onlostpointercapture=()=>{start=null;pin.style.translate=''};
  pin.onkeydown=e=>{const d={ArrowUp:[0,-10],ArrowDown:[0,10],ArrowLeft:[-10,0],ArrowRight:[10,0]}[e.key];if(d){e.preventDefault();select(offset(get(),...d,zoom))}};
  root.querySelector('.in').onclick=()=>{zoom=limit(zoom+1,3,19);draw()};
  root.querySelector('.out').onclick=()=>{zoom=limit(zoom-1,3,19);draw()};
  new ResizeObserver(draw).observe(tiles);return draw;
}
