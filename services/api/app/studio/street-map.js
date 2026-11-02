// Draw only the visible raster tiles. This also works in browsers without WebGL.
const tileSize = 256;
export function renderStreets(point, side, zoom) {
  const map = document.getElementById('street');
  const n = 2 ** zoom;
  const radians = point.lat * Math.PI / 180;
  const worldX = (point.lon + 180) / 360 * n;
  const worldY = (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * n;
  const left = worldX * tileSize - map.clientWidth / 2;
  const top = worldY * tileSize - map.clientHeight / 2;
  const fragment = document.createDocumentFragment();
  for (let y = Math.floor(top / tileSize); y * tileSize < top + map.clientHeight; y++) {
    if (y < 0 || y >= n) continue;
    for (let x = Math.floor(left / tileSize); x * tileSize < left + map.clientWidth; x++) {
      const tile = document.createElement('img');
      tile.alt = '';
      tile.draggable = false;
      tile.style.left = Math.round(x * tileSize - left) + 'px';
      tile.style.top = Math.round(y * tileSize - top) + 'px';
      tile.src = 'https://tile.openstreetmap.org/' + zoom + '/' + ((x % n + n) % n) + '/' + y + '.png';
      tile.onerror = () => {
        if (tile.isConnected) document.getElementById('tile-status').textContent = 'Some street tiles could not load. Open the larger map or try again later.';
      };
      fragment.append(tile);
    }
  }
  const marker = document.createElement('span');
  marker.className = 'street-pin';
  marker.textContent = side === 0 ? 'A' : 'B';
  fragment.append(marker);
  document.getElementById('tile-status').textContent = '';
  map.replaceChildren(fragment);
  map.setAttribute('aria-label', (side === 0 ? 'Pickup' : 'Drop-off') + ' street map at ' + point.name);
}
