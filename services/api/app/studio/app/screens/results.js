import {filtersMarkup, bindFilters} from '../components/search-filters.js';
import {
  access
} from '../components/access.js';
import {
  head,
  back,
  icon,
  esc,
  empty,
  notice,
  pending
} from '../ui.js';
import {
  rideCard
} from '../components/ride-summary.js';
export async function mount(ctx) {
  if (!ctx.api) return access(ctx, 'Available rides', 'The ride service is currently unavailable.');
  const {
    root,
    api,
    state,
    signal
  } = ctx;
  let q = state.query || {};
  const route = q.origin && q.destination ? q.origin.name + ' → ' + q.destination.name :
    'All upcoming rides';
  root.innerHTML = back('#/find', 'Edit search') + head('Passenger / Search', 'Available rides', route) +
    `<div class="result-toolbar"><span class="pill">${icon('route',14)} ${q.origin?'Selected route':'All routes'}</span><span class="meta">${q.origin?'Mapped stops within 2 km or matching stop names':'Upcoming segments with a free seat'}</span></div>
      ${filtersMarkup(q)}<div class="result-list" aria-live="polite"></div><div data-notice role="status" hidden></div>
      <button data-more class="btn secondary" hidden>Show more rides</button>`;
  const list = root.querySelector('.result-list'),
    more = root.querySelector('[data-more]');
  let offset = 0, version = 0, timer, request;
  bindFilters(root, value => {
    q = {...q,...value}; state.query = q; offset = 0; version++; request?.abort();
    clearTimeout(timer); timer = setTimeout(load,420);
  });
  signal.addEventListener('abort',()=>{clearTimeout(timer);request?.abort()},{once:true});
  async function load() {
    const current = ++version; request?.abort(); request = new AbortController();
    more.hidden = true;
    list.setAttribute('aria-busy', 'true');
    if (!offset) list.innerHTML = '<div class="loading">Finding rides…</div>';
    try {
      const response = await api.search({
        ...q,
        offset
      }, request.signal);
      if (signal.aborted || current !== version) return;
      if (!offset) list.replaceChildren();
      list.insertAdjacentHTML('beforeend', response.items.map(rideCard).join(''));
      offset += response.items.length;
      if (!offset) {
        list.innerHTML = empty('No rides for this search',
            'Try a different day or a nearby stop, or browse the other available routes.', '#/find',
            'Change stops') +
          (q.origin ? '<button class="btn secondary" data-all>Show all routes</button>' : '');
        const all = list.querySelector('[data-all]');
        if (all) all.onclick = () => {
          state.query = {};
          location.hash = '/results?all=1'
        }
      }
      more.hidden = !response.more;
      notice(root, '');
    } catch (e) {
      if (signal.aborted || current !== version) return;
      if (!offset) list.replaceChildren();
      notice(root, e.message, 'error');
      more.textContent = 'Retry search';
      more.hidden = false
    } finally {
      if(current===version) list.removeAttribute('aria-busy')
    }
  }
  more.onclick = () => pending(more, load, e => notice(root, e, 'error'));
  await load();
}
