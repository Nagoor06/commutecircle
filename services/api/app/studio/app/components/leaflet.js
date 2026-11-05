const libraryUrl = new URL('../../lib/leaflet/leaflet.js', import.meta.url).href;
const cssUrl = new URL('../../lib/leaflet/leaflet.css', import.meta.url).href;
let loader;

export function leaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!loader) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = cssUrl;
    document.head.append(link);
    loader = new Promise((resolve, reject) => {
      const js = document.createElement('script');
      js.src = libraryUrl;
      js.onload = () => resolve(window.L);
      js.onerror = () => {
        loader = null;
        reject(Error('Map could not be loaded. Use the location fields to continue.'))
      };
      document.head.append(js);
    });
  }
  return loader;
}
