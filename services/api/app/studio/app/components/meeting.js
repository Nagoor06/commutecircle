import {
  esc,
  icon
} from '../ui.js';
import {
  finitePlace
} from '../data/places.js';
export function meetingMarkup(signed, initial) {
  return `<details class="panel meeting"><summary><span>${icon('pin')} Pickup instructions</span>${icon('down')}</summary>
    <p>Add the gate or public landmark where you will meet.</p><label class="field">Meeting landmark<input data-landmark maxlength="120" value="${esc(initial)}" placeholder="E.g. outside the main entrance"></label>
    <button data-copy class="btn secondary">${icon('copy',16)} Copy pickup instructions</button>
    ${signed?`<div class="field"><label>Translate the landmark <select data-language>${['Telugu','English','Hindi','Tamil','Kannada'].map(l=>`<option>${l}</option>`).join('')}</select></label><button class="text-btn" data-translate>Send note for translation</button></div>`:''}<p class="muted" data-feedback role="status"></p></details>`;
}
export function bindMeeting(node, {
  getPoint,
  state,
  api
}) {
  const input = node.querySelector('[data-landmark]'),
    feedback = node.querySelector('[data-feedback]');
  input.oninput = () => {
    state.landmark = input.value
  };
  node.querySelector('[data-copy]').onclick = async () => {
    const p = getPoint();
    const card = ['Meet at ' + p.name, input.value.trim(), finitePlace(p) ?
      'https://www.openstreetmap.org/?mlat=' + p.lat.toFixed(5) + '&mlon=' + p.lon.toFixed(5) : ''
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(card);
      feedback.textContent = 'Meeting card copied.'
    } catch {
      feedback.textContent = card
    }
  };
  const translate = node.querySelector('[data-translate]');
  if (translate) translate.onclick = async () => {
    const landmark = input.value.trim();
    if (!landmark) {
      feedback.textContent = 'Add a landmark first.';
      return
    }
    translate.disabled = true;
    feedback.textContent = 'Translating…';
    try {
      feedback.textContent = 'Review translation: ' + (await api.translate(landmark, node.querySelector(
        '[data-language]').value)).translation
    } catch {
      feedback.textContent = 'Translation is unavailable. You can copy the original note.'
    } finally {
      translate.disabled = false
    }
  };
}
