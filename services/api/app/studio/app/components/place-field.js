import {
  icon,
  esc
} from '../ui.js';
import {
  knownPlace,
  normal,
  parseCoordinates,
  finitePlace
} from '../data/places.js';
import {
  immediateMatches,
  suggest
} from '../data/geocoder.js';
import {nearbyPublicStops} from '../data/public-stops.js';

export function fieldMarkup(i, p, options = {}) {
  const label = options.label || (i ? 'Drop-off' : 'Pickup'),
    badge = options.badge || (i ? 'B' : 'A');
  const id = 'place-' + i;
  return `<div class="place-field" data-field="${i}"><label for="${id}"><span class="point-key ${i?'orange':''}">${esc(badge)}</span>${esc(label)}</label>
    <div class="place-entry"><input id="${id}" aria-label="${esc(label)}" autocomplete="off" maxlength="120" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}-list" value="${esc(p.name)}"><button type="button" class="icon-only" aria-label="Edit ${esc(label)}">${icon('pin',17)}</button></div>
    <small class="place-sub">${esc(p.area||'Public meeting place')}</small>
    <div class="suggestions" hidden><div id="${id}-list" role="listbox" aria-label="${esc(label)} suggestions"></div><div class="lookup-actions"><small data-hint role="status"></small><button data-gps type="button">${icon('target',14)} Find public stops near me</button></div></div>
  </div>`;
}
export function attachField(node, {
  initial,
  update,
  onDraft,
  info,
  signal,
  geocoder
}) {
  const input = node.querySelector('input'),
    sub = node.querySelector('.place-sub'),
    popup = node.querySelector('.suggestions'),
    list = node.querySelector('[role=listbox]'),
    hint = node.querySelector('[data-hint]');
  let selected = initial,
    results = [],
    active = -1,
    request, generation = 0,
    timer;

  function invalidate() {
    generation++;
    clearTimeout(timer);
    request?.abort()
  }

  function close() {
    invalidate();
    popup.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1
  }

  function set(p) {
    selected = p;
    input.value = p.name;
    sub.textContent = p.area || 'Public meeting place';
    close()
  }

  function choose(p) {
    if (update(p) !== false) set(p)
  }

  function show(items, message = '') {
    results = items;
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    for (const [n, p] of items.entries()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.role = 'option';
      b.id = input.id + '-opt-' + n;
      b.tabIndex = -1;
      b.innerHTML = icon('pin', 16) + '<span><b>' + esc(p.name) + '</b><small>' + esc(p.area ||
        'Public stop') + '</small></span>';
      b.onmousedown = e => e.preventDefault();
      b.onclick = () => choose(p);
      list.append(b);
    }
    hint.textContent = message;
    popup.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function search(edited) {
    invalidate();
    const q = input.value.trim();
    if (edited) {
      sub.textContent = 'Choose a matching place to update the pin';
      onDraft()
    }
    if (!q || (!edited && normal(q) === normal(selected.name))) {
      show(immediateMatches(''), 'Suggested places');
      return
    }
    try {
      const pair = parseCoordinates(q);
      if (pair) {
        show([pair], 'Choose this pin');
        return
      }
    } catch (e) {
      show([], e.message);
      return
    }
    if (q.length < 2) {
      show(immediateMatches(q), 'Type at least 2 letters');
      return
    }
    const id = generation;
    show(immediateMatches(q), 'Looking for places…');
    timer = setTimeout(async () => {
      const req = new AbortController();
      request = req;
      try {
        const local = items => {
          if (id === generation && !signal.aborted) show(items, items.length ? 'Matching places' :
            'Looking for places…')
        };
        const result = await suggest(q, {
          signal: req.signal,
          onLocal: local,
          geocoder
        });
        if (id !== generation || signal.aborted) return;
        show(result.items, result.offline ?
          'Online lookup unavailable. Use a station, coordinates or a pin.' : result.items.length ?
          'Matching places' : 'No matching place. Try a different name or drag the pin.');
      } catch (e) {
        if (id === generation && !signal.aborted) show([], e.message)
      }
    }, 360);
  }
  input.onfocus = () => {
    input.select();
    search(false)
  };
  input.oninput = () => search(true);
  node.querySelector('.icon-only').onclick = () => {
    input.focus();
    input.select();
    search(false)
  };
  input.onkeydown = e => {
    if (e.key === 'Escape') {
      set(selected);
      onDraft();
      return
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (popup.hidden) search(false);
      if (!results.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length;
      [...list.children].forEach((n, i) => n.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', input.id + '-opt-' + active);
    }
    if (e.key === 'Enter' && !popup.hidden) {
      e.preventDefault();
      if (results.length) choose(results[Math.max(0, active)])
    }
  };
  node.addEventListener('focusout', e => {
    if (!node.contains(e.relatedTarget)) close()
  });
  document.addEventListener('pointerdown', e => {
    if (!node.contains(e.target)) close()
  }, {
    signal
  });
  node.querySelector('[data-gps]').onclick = () => {
    invalidate();
    const id = generation;
    if (!navigator.geolocation) {
      info('Location is unavailable on this device.');
      return
    }
    info('Waiting for location permission…');
    navigator.geolocation.getCurrentPosition(async ({
      coords
    }) => {
      if (signal.aborted || id !== generation) return;
      const p = {
        name: 'Current location',
        area: 'Select to display this point on the map',
        lat: coords.latitude,
        lon: coords.longitude
      };
      if (!finitePlace(p)) {
        info('This point is outside map coverage.');
        return
      }
      try {
        const candidates = await nearbyPublicStops(p, signal);
        if (signal.aborted || id !== generation) return;
        show(candidates, candidates.length ? 'Choose a public stop. Device coordinates stay in this browser.' : 'No catalogue stops within 5 km. Search for a public landmark.');
        info('');
      } catch (error) {
        if (!signal.aborted && id === generation) info(error.message);
      }
    }, () => {
      if (!signal.aborted && id === generation) info(
        'Device location is unavailable. You can type a stop or drag a pin.')
    }, {
      timeout: 9000
    });
  };
  signal.addEventListener('abort', invalidate, {
    once: true
  });

  function value() {
    const typed = input.value.trim();
    if (!typed) throw Error('Enter both a pickup and a drop-off.');
    if (normal(typed) === normal(selected.name)) return selected;
    if (typed.length > 80 && !parseCoordinates(typed)) throw Error('Stop names can be up to 80 characters.');
    return parseCoordinates(typed) || knownPlace(typed) || {
      name: typed,
      area: 'Match by stop name'
    };
  }
  return {
    set,
    value,
    close
  };
}
