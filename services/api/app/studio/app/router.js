import {
  empty
} from './ui.js';
const routes = {
  find: () => import('./screens/find.js'),
  results: () => import('./screens/results.js'),
  ride: () => import('./screens/ride.js'),
  checkout: () => import('./screens/checkout.js'),
  offer: () => import('./screens/offer.js'),
  trips: () => import('./screens/trips.js'),
  signin: () => import('./screens/signin.js'),
  profile: () => import('./screens/profile.js'),
  chat: () => import('./screens/chat.js'),
  messages: () => import('./screens/messages.js'),
  share: () => import('./screens/share.js'),
  track: () => import('./screens/track.js'),
  help: () => import('./screens/help.js')
};
const groups = {
  results: 'find',
  ride: 'find',
  checkout: 'trips',
  share: 'trips',
  chat: 'messages',
  book: 'find'
};
const titles = {
  find: 'Book a ride',
  results: 'Available rides',
  ride: 'Ride details',
  checkout: 'Checkout',
  offer: 'Offer a ride',
  trips: 'My trips',
  signin: 'Sign in',
  profile: 'My profile',
  chat: 'Booking chat',
  messages: 'Messages',
  share: 'Share my trip',
  track: 'Follow a trip',
  help: 'Help'
};
export const go = route => {
  location.hash = '/' + route
};
export function startRouter(app) {
  let controller, first = true;
  async function render() {
    controller?.abort();
    controller = new AbortController();
    const {
      signal
    } = controller;
    const raw = location.hash.slice(1).replace(/^\//, '') || 'find';
    const [path, query] = raw.split('?'), [slug, ...parts] = path.split('/');
    const name = slug === 'book' ? 'find' : slug;
    const main = document.querySelector('#main');
    const root = document.createElement('div');
    root.className = 'page';
    root.innerHTML = '<p class="loading" role="status">Opening your screen…</p>';
    main.replaceChildren(root);
    main.setAttribute('aria-busy', 'true');
    document.title = (titles[name] || 'Page unavailable') + ' · CommuteCircle';
    document.querySelectorAll('[data-nav]').forEach(n => {
      if (n.dataset.nav === (groups[name] || name)) n.setAttribute('aria-current', 'page');
      else n.removeAttribute('aria-current')
    });
    if (!first) {
      window.scrollTo({
        top: 0,
        behavior: 'instant'
      });
      main.focus({
        preventScroll: true
      })
    }
    first = false;
    try {
      if (!Object.hasOwn(routes, name)) {
        root.innerHTML = empty('Page unavailable', 'Return to the planner to continue.', '#/find',
          'Find a ride');
        return
      }
      const screen = await routes[name]();
      if (signal.aborted) return;
      await screen.mount({
        ...app,
        root,
        signal,
        parts,
        query: new URLSearchParams(query || ''),
        go,
        render
      });
    } catch (error) {
      if (signal.aborted) return;
      root.innerHTML = empty('We couldn’t open this screen', error.message, '#/find', 'Back to Find');
    } finally {
      if (!signal.aborted) {
        main.removeAttribute('aria-busy');
        document.querySelector('#announcement').textContent = titles[name] || 'Page unavailable'
      }
    }
  }
  window.addEventListener('hashchange', render);
  document.querySelector('.skip').onclick = e => {
    e.preventDefault();
    document.querySelector('#main').focus()
  };
  render();
}
