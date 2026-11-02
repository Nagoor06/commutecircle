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
export function attachMap(root,points,select) {
  const tiles=root.querySelector('.tiles'), pins=[...root.querySelectorAll('.handle')];
  let zoom=15,center=points[0],lastKey='';
  const wrapped=(dx,size)=>((dx+size/2)%size+size)%size-size/2;
  function fit() {
    const [a,b]=points.map(p=>project(p,0));
    const dx=wrapped(b[0]-a[0],256), dy=b[1]-a[1];
    center=offset(points[0],dx/2,dy/2,0);
    zoom=limit(Math.floor(Math.log2(Math.min((tiles.clientWidth-90)/Math.max(.001,Math.abs(dx)),
      (tiles.clientHeight-100)/Math.max(.001,Math.abs(dy))))),0,16);
    draw();
  }
  function draw(){
    const w=tiles.clientWidth,h=tiles.clientHeight;if(!w||!h)return;
    const [x,y]=project(center,zoom),n=2**zoom,left=x-w/2,top=y-h/2;
    points.forEach((p,i)=>{const [px,py]=project(p,zoom);pins[i].style.left=(w/2+wrapped(px-x,n*256))+'px';pins[i].style.top=(h/2+py-y)+'px'});
    const key=[x,y,zoom,w,h].join('/');if(lastKey===key)return;lastKey=key;
    const fragment=document.createDocumentFragment();
    for(let ty=Math.floor(top/256);ty*256<top+h;ty++){
      if(ty<0||ty>=n)continue;
      for(let tx=Math.floor(left/256);tx*256<left+w;tx++){
        const img=document.createElement('img');img.alt='';img.draggable=false;
        img.style.left=Math.round(tx*256-left)+'px';img.style.top=Math.round(ty*256-top)+'px';
        img.src='https://tile.openstreetmap.org/'+zoom+'/'+((tx%n+n)%n)+'/'+ty+'.png';
        img.onerror=()=>{if(img.isConnected)root.querySelector('.message').textContent='Some tiles could not load. Both location fields still work.'};
        fragment.append(img);
      }
    }
    root.querySelector('.message').textContent='';tiles.replaceChildren(fragment);
  }
  function draggable(target,move,finish){
    let start;
    target.onpointerdown=e=>{if(e.button!==0||!e.isPrimary)return;start=[e.clientX,e.clientY];target.setPointerCapture(e.pointerId)};
    target.onpointermove=e=>{if(start)move(e.clientX-start[0],e.clientY-start[1])};
    target.onpointerup=e=>{if(!start)return;const dx=e.clientX-start[0],dy=e.clientY-start[1];start=null;move(0,0);if(dx||dy)finish(dx,dy)};
    target.onlostpointercapture=()=>{start=null;move(0,0)};
  }
  pins.forEach((pin,i)=>{
    const move=(dx,dy)=>select(i,offset(points[i],dx,dy,zoom));
    draggable(pin,(dx,dy)=>pin.style.translate=dx+'px '+dy+'px',move);
    pin.onkeydown=e=>{const d={ArrowUp:[0,-10],ArrowDown:[0,10],ArrowLeft:[-10,0],ArrowRight:[10,0]}[e.key];if(d){e.preventDefault();move(...d)}};
  });
  draggable(tiles,()=>{},(dx,dy)=>{center=offset(center,-dx,-dy,zoom);draw()});
  root.querySelector('.in').onclick=()=>{zoom=limit(zoom+1,0,19);draw()};
  root.querySelector('.out').onclick=()=>{zoom=limit(zoom-1,0,19);draw()};
  root.querySelector('.fit').onclick=fit;new ResizeObserver(fit).observe(tiles);return fit;
}
