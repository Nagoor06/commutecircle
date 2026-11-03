import {
  head,
  icon,
  esc,
  confirmation
} from '../ui.js';
const guide = 'https://github.com/Nagoor06/commutecircle/blob/main/services/ride-help/guide.md';
const items = [
  ['How do I find a seat?',
    'Set a pickup and drop-off on Find. Results match the stops in travel order, check seats on every leg and exclude boarding times that have passed.'
  ],
  ['What happens to the last seat?',
    'Only one overlapping reservation can hold it. You have up to three minutes, ending at boarding time if that is sooner. An expired hold cannot be paid.'
  ],
  ['Will I be charged real money?',
    'Checkout uses sandbox money. A booking is stored against your signed-in account.'
  ],
  ['How much does part of a ride cost?',
    'The driver sets the full-route price. Your fare is proportional to the distance between your selected stops. Another rider can book the onward legs.'
  ],
  ['What if the driver cancels?',
    'When a driver cancels before boarding, paid passengers receive a full sandbox refund. Unpaid holds have no fee.'
  ],
  ['What if my plans change?',
    'Cancel in your receipt. At least 24 hours before pickup is free. From 2 to under 24 hours the fee is 10%, and within 2 hours before pickup it is 25% of your segment fare.'
  ],
  ['What makes someone eligible to review?',
    'A passenger with a paid segment can review after the scheduled drop-off, or after a driver-confirmed early exit. Updating the review replaces that rating.'
  ]
];
export function mount({
  root,
  api,
  auth,
  signal,
  go
}) {
  root.innerHTML = head('Support / Rider guide', 'Help centre',
      'Answers about reservations, fares and meeting your driver.') +
    `<div class="help-layout"><section class="panel"><div class="panel-cap">${icon('help')} Common questions</div>${items.map(([q,a])=>`<details class="faq"><summary>${esc(q)} ${icon('down',16)}</summary><p>${esc(a)}</p></details>`).join('')}</section>
   <aside class="stack"><section class="panel accent-panel"><div class="panel-cap">${icon('spark')} Ride assistant</div><h2>Ask the guide</h2>
   ${api&&auth.help?'<form data-ask><label class="field">Question<input required maxlength="300" placeholder="When can I cancel for free?"></label><button class="btn primary">Ask question</button></form><p data-answer role="status"></p>':'<p>AI answers with source links are available in the signed-in studio when the local ride-help service is running.</p>'}
   <a data-source href="${guide}" target="_blank" rel="noopener" class="text-btn">Open rider guide ${icon('arrow',16)}</a></section>
</aside></div>`;
  const form = root.querySelector('[data-ask]');
  if (!form) return;
  form.onsubmit = async e => {
    e.preventDefault();
    const q = form.querySelector('input').value.trim();
    if (!q) return;
    const b = form.querySelector('button'),
      answer = root.querySelector('[data-answer]'),
      link = root.querySelector('[data-source]');
    b.disabled = true;
    link.href = guide;
    link.textContent = 'Open rider guide';
    answer.textContent = 'Checking the guide…';
    try {
      const result = await api.ask(q);
      if (signal.aborted) return;
      answer.textContent = result.answer;
      const source = result.sources[0];
      if (source?.url.startsWith(guide + '#')) {
        link.href = source.url;
        link.textContent = source.title
      }
    } catch (e) {
      if (!signal.aborted) answer.textContent = e.message
    } finally {
      b.disabled = false
    }
  };
}
