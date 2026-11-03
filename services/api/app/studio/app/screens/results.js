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
  if (!ctx.api) return access(ctx, 'Available rides', 'Sign in to see live matches and hold a seat.');
  const {
    root,
    api,
    state,
    signal
  } = ctx;
  const q = state.query || {};
  const route = q.origin && q.destination ? q.origin.name + ' → ' + q.destination.name :
    'All upcoming rides';
  root.innerHTML = back('#/find', 'Edit search') + head('Passenger / Search', 'Available rides', route) +
    `<div class="result-toolbar"><span class="pill">${icon('route',14)} ${q.origin?'Selected route':'All routes'}</span><span class="meta">${q.origin?'Mapped stops within 2 km or matching stop names':'Upcoming segments with a free seat'}</span></div>
      <div class="result-list" aria-live="polite"></div><div data-notice role="status" hidden></div>
      <button data-more class="btn secondary" hidden>Show more rides</button>`;
  const list = root.querySelector('.result-list'),
    more = root.querySelector('[data-more]');
  let offset = 0;
  async function load() {
    more.hidden = true;
    list.setAttribute('aria-busy', 'true');
    if (!offset) list.innerHTML = '<div class="loading">Finding rides…</div>';
    try {
      const response = await api.search({
        ...q,
        offset
      }, signal);
      if (signal.aborted) return;
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
      if (signal.aborted) return;
      if (!offset) list.replaceChildren();
      notice(root, e.message, 'error');
      more.textContent = 'Retry search';
      more.hidden = false
    } finally {
      list.removeAttribute('aria-busy')
    }
  }
  more.onclick = () => pending(more, load, e => notice(root, e, 'error'));
  await load();
}
