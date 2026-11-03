import {
  fieldMarkup,
  attachField
} from '../components/place-field.js';
import {
  head,
  back,
  icon,
  esc,
  money,
  day,
  clock,
  dateInput,
  dateTimeInput,
  notice,
  pending
} from '../ui.js';
import {
  knownPlace,
  normal,
  finitePlace
} from '../data/places.js';

function blank(state) {
  return {
    key: crypto.randomUUID(),
    stops: [{
      ...state.route[0],
      km: 0,
      minutes: 0
    }, {
      ...state.route[1],
      km: '',
      minutes: ''
    }],
    time: dateTimeInput(new Date(Date.now() + 86400000)),
    price: '',
    seats: 1,
    withCar: false,
    car: {
      condition: 'good'
    }
  };
}
export function mount(ctx) {
  const {
    root,
    state,
    api,
    query,
    go
  } = ctx;
  const d = state.offer || (state.offer = blank(state));
  if (query.get('step') === 'review' && d.ready) {
    review();
    return
  }
  root.innerHTML = head('Driver / Create an offer', 'Offer a ride',
      'Set the stops, timing and price for one seat on your route.') +
    `<form id="offer-form"><div class="offer-layout"><div class="stack">
      <section class="panel"><div class="panel-cap"><span class="step-no">01</span> Your route</div><p class="panel-intro">Add stops in travel order. Distance and time are measured from your first stop.</p>
      <div data-stops></div><button type="button" data-add-stop class="text-btn">${icon('plus',16)} Add an intermediate stop</button></section>
      <section class="panel"><div class="panel-cap"><span class="step-no">02</span> Departure & fare</div><div class="form-grid">
        <label class="field span-2">Departure · local time<input type="datetime-local" name="time" required value="${esc(d.time)}"></label>
        <label class="field">Full-route fare per seat (₹)<input name="price" type="number" min="1" max="100000" step=".01" required placeholder="200" value="${esc(d.price)}"></label>
        <label class="field">Seats offered<select name="seats">${Array.from({length:8},(_,i)=>` <
    option value = "${i+1}"
  $ {
    d.seats == i + 1 ? 'selected' : ''
  } > $ {
    i + 1
  } < /option>`).join('')}</select > < /label> <
  /div></section >
  <
  section class = "panel" > < div class = "panel-cap" > < span class = "step-no" > 03 <
    /span> Vehicle details</div >
    <
    label class = "checkline" > < input type = "checkbox"
  name = "withCar"
  $ {
    d.withCar ? 'checked' : ''
  } > Include my vehicle on this offer < /label> <
    div data - car class = "form-grid"
  $ {
    d.withCar ? '' : 'hidden'
  } > $ {
    [
      ['make', 'Make', 'Honda', 60],
      ['model', 'Model', 'City', 60],
      ['color', 'Colour', 'White', 40]
    ].map(([key, label, example, max]) =>
      `<label class="field">${label}<input name="${key}" maxlength="${max}" placeholder="${example}" value="${esc(d.car[key])}"></label>`
      ).join('')
  } <
  label class = "field" > Date purchased < input type = "date"
  name = "purchased_on"
  min = "1886-01-01"
  max = "${dateInput()}"
  value = "${esc(d.car.purchased_on)}" > < /label> <
    label class = "field" > Driver - reported condition < select name = "condition" > $ {
      ['excellent', 'good', 'fair'].map(v => `<option ${v===d.car.condition?'selected':''}>${v}</option>`)
        .join('')
    } < /select></label > < /div></section > < /div> <
    aside class = "panel summary-note" > < div class = "section-index" > < span class = "index-dot" > <
    /span> Offer summary</div > < h2 data - summary > <
    /h2><p>Passengers can reserve just the legs they travel. The remaining legs stay available.</p >
    <
    div class = "note-box" > $ {
      icon('info')
    } < span > $ {
      'Only published offers appear in passenger searches.'
    }
  Payments use sandbox money. < /span></div >
    <
    button class = "btn primary wide"
  type = "submit" > Review ride $ {
      icon('arrow')
    } < /button><div data-notice role="status" hidden></div > < /aside> <
    /div></form > `;
  const form=root.querySelector('form'),rows=root.querySelector('[data-stops]'),car=root.querySelector('[data-car]');
  function carFields(){car.hidden=!d.withCar;for(const field of car.querySelectorAll('input,select')){field.disabled=!d.withCar;field.required=d.withCar}}
  function summary(){root.querySelector('[data-summary]').textContent=(d.stops[0].name||'Pickup')+' → '+(d.stops.at(-1).name||'Drop-off')}
  let stopSignals;
  ctx.signal.addEventListener('abort',()=>stopSignals?.abort(),{once:true});
  function drawStops(){
    stopSignals?.abort();stopSignals=new AbortController();
    rows.innerHTML=d.stops.map((s,i)=>` < div class = "offer-stop"
  data - row = "${i}" > < div class = "stop-heading" > < span class =
    "point-key ${i===d.stops.length-1?'orange':''}" > $ {
      i + 1
    } < /span><b>${i===0?'Pickup':i===d.stops.length-1?'Final drop-off':'Intermediate stop'}</b >
    $ {
      i > 0 && i < d.stops.length - 1 ?
        `<button type="button" class="icon-only" aria-label="Remove stop ${i+1}" data-remove="${i}">${icon('close',16)}</button>` :
        ''
    } < /div> <
    div class = "stop-fields" > $ {
      fieldMarkup('offer-' + i, s, {
        label: 'Meeting place',
        badge: String(i + 1)
      })
    } <
    label class = "field" > km from start < input data - value = "km"
  type = "number"
  min = "0"
  max = "3000"
  step = ".001"
  required $ {
    i === 0 ? 'readonly' : ''
  }
  value = "${esc(s.km)}" > < /label> <
    label class = "field" > min from start < input data - value = "minutes"
  type = "number"
  min = "0"
  max = "2880"
  step = "1"
  required $ {
    i === 0 ? 'readonly' : ''
  }
  value = "${esc(s.minutes)}" > < /label></div > < /div>`).join('');
  rows.querySelectorAll('.place-field').forEach((node, i) => {
    const field = node.querySelector('input');
    field.required = true;
    field.maxLength = 80;
    field.dataset.value = 'name';
    attachField(node, {
      initial: {
        ...d.stops[i]
      },
      update: p => {
        Object.assign(d.stops[i], p);
        d.ready = null;
        summary()
      },
      onDraft: () => {},
      info: m => notice(root, m),
      signal: stopSignals.signal,
      geocoder: ctx.geocoder
    });
  });
  root.querySelector('[data-add-stop]').disabled = d.stops.length >= 16;
  rows.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    d.stops.splice(+b.dataset.remove, 1);
    drawStops();
    summary()
  });
}
root.querySelector('[data-add-stop]').onclick = () => {
  d.stops.splice(-1, 0, {
    name: '',
    km: '',
    minutes: ''
  });
  drawStops();
  rows.querySelectorAll('[data-value=name]')[d.stops.length - 2].focus();
};
drawStops();
summary();
carFields();
form.oninput = e => {
  const f = e.target;
  d.ready = null;
  if (f.dataset.value) {
    const s = d.stops[+f.closest('[data-row]').dataset.row];
    s[f.dataset.value] = f.value;
    if (f.dataset.value === 'name') {
      delete s.lat;
      delete s.lon
    }
    summary()
  } else if (f.name === 'withCar') {
    d.withCar = f.checked;
    carFields()
  } else if (car.contains(f)) d.car[f.name] = f.value;
  else if (f.name) d[f.name] = f.value;
};
form.onsubmit = e => {
  e.preventDefault();
  try {
    const depart = new Date(d.time);
    if (!Number.isFinite(+depart) || +depart <= Date.now()) throw Error('Choose a future departure time.');
    const stops = d.stops.map(s => {
      const name = s.name.trim(),
        point = finitePlace(s) ? s : knownPlace(name);
      if (!name) throw Error('Give every stop a public meeting place.');
      return {
        name,
        metres: Math.round(Number(s.km) * 1000),
        minutes: Number(s.minutes),
        ...(point ? {
          lat: point.lat,
          lon: point.lon
        } : {})
      };
    });
    for (let i = 1; i < stops.length; i++) {
      if (stops[i].metres <= stops[i - 1].metres || stops[i].minutes <= stops[i - 1].minutes) throw Error(
        'Distance and time must increase at stop ' + (i + 1) + '.');
      if (normal(stops[i].name) === normal(stops[i - 1].name)) throw Error(
        'Adjacent stops need different names.');
    }
    d.ready = {
      offer_id: d.key,
      stops,
      departure: depart.toISOString(),
      capacity: Number(d.seats),
      price_paise: Math.round(Number(d.price) * 100),
      ...(d.withCar ? {
        vehicle: {
          ...d.car
        }
      } : {})
    };
    go('offer?step=review');
  } catch (error) {
    notice(root, error.message, 'error')
  }
};

function review() {
  const offer = d.ready;
  root.innerHTML = back('#/offer', 'Edit offer') + head('Driver / Review', 'Review your ride',
      'Check the route and fare passengers will see.') +
    `<div class="details-grid"><section class="panel"><div class="panel-cap">${icon('route')} Route and timing</div><ol class="stop-list">${offer.stops.map((p,i)=>`<li><span class="stop-time">${esc(clock(Date.parse(offer.departure)+p.minutes*60000))}</span><i class="${i===offer.stops.length-1?'last':''}"></i><div><b>${esc(p.name)}</b><small>${p.metres/1000} km from start</small></div></li>`).join('')}</ol></section>
      <section class="panel"><div class="panel-cap">${icon('car')} Your offer</div><div class="fare-line"><span>Full fare per seat</span><b>${money(offer.price_paise)}</b></div><p>${esc(day(offer.departure))} · ${offer.capacity} seat(s)</p>
      <p class="muted">${offer.vehicle?esc(offer.vehicle.make+' '+offer.vehicle.model):'Vehicle details not supplied'}</p>
      <button data-publish class="btn primary wide">${api?'Publish ride':ctx.auth.enabled?'Sign in to publish':'Publishing unavailable'} ${icon('arrow')}</button><div data-notice role="status" hidden></div></section></div>`;
  const publish = root.querySelector('[data-publish]');
  if (!api) {
    if (ctx.auth.enabled) {
      publish.onclick = () => {
        try {
          sessionStorage.setItem('cc:offer-signin', JSON.stringify({
            draft: d,
            until: Date.now() + 1800000
          }))
        } catch {}
        ctx.auth.login()
      }
    } else {
      publish.disabled = true;
      notice(root, ctx.auth.problem || 'The shared booking service is unavailable.', 'info')
    }
    return;
  }
  publish.onclick = () => pending(publish, async () => {
    if (Date.parse(offer.departure) <= Date.now()) throw Error(
      'Departure has passed. Edit the time before publishing.');
    await api.publish(offer);
    state.offer = null;
    if (!ctx.signal.aborted) go('trips?view=driving');
  }, e => notice(root, e, 'error'));
}
}
