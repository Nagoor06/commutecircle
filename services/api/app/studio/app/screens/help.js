import {
  head,
  icon,
  esc,
  confirmation
} from '../ui.js';
const guide = 'https://github.com/Nagoor06/commutecircle/blob/main/services/ride-help/guide.md';
const items = [
  ['What is CommuteCircle for?', 'Share a seat on a journey a driver already plans to make. Meet at public points, pay for the segment you travel and leave the onward seat available to someone else. Your saved office preferences and contact details stay private.'],
  ['Will I receive a booking confirmation?', 'Your receipt is always in My trips. In Profile, enable email to your verified sign-in address and optionally choose WhatsApp or SMS after phone verification. Alerts are queued only after confirmation; a seat hold is not a booking. Delivery depends on the configured provider. The receipt shows queued, accepted, unavailable or uncertain status. Accepted does not mean delivered. Payments are currently sandbox only.'],
  ['Can I track the vehicle live?', 'Open Track vehicle from a confirmed booking. Your driver must start location sharing and separately allow confirmed passengers. Choose Show live map to follow the car marker from the driver’s GPS, with update age and accuracy. Your own Share my trip link shows your location as a passenger, using a person marker. Keep the sharing browser open; updates can pause in the background.'],
  ['Can I choose a place more than 50 km away?', 'Yes. Suggestions start near your other stop. Type a city or landmark and search automatically includes stronger matches farther away, or expands when no nearby place matches. You can also enter coordinates or drag either map pin. The suggestion range never limits your journey.'],
  ['How can my favourite contacts follow my trip?', 'Save up to five favourites in Profile. Open Share my trip from a confirmed booking or your driver offer, agree to precise location sharing, then send the private link yourself. Anyone with the link can view it without an account. Stop sharing or cancellation ends access. Keep the page open: phone browsers can pause background GPS, and five minutes without updates ends the link.'],
  ['Can I browse without signing in?', 'Yes. Choose a date and public meeting points to see rides, fares and vehicle details. Sign in when booking, listing or messaging.'],
  ['How does Circle pickup protect my address?', 'Choose a public pickup point. Nearby-stop lookup compares your location locally, then lets you choose a station area. Your device location is not used as the pickup pin. Never choose a private home pin.'],
  ['How do I see office rides first?', 'Open Profile and save your public pickup and office-area meeting points. Best commute match puts available rides between those points first. Your employer label stays private.'],
  ['Can I message without sharing my phone?', 'Booking chat opens after confirmation. Common phone numbers, emails and contact links are blocked. Either participant can block further messages. Disguised details may bypass filters, so keep the conversation about the ride.'],
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
   ${api&&auth.signed&&auth.help?'<form data-ask><label class="field">Question<input required maxlength="300" placeholder="When can I cancel for free?"></label><p class="fine">Ask general questions. Leave out home addresses, phone numbers and workplace names.</p><button class="btn primary">Ask question</button></form><p data-answer role="status"></p>':'<p>AI answers with source links are available in the signed-in studio when the local ride-help service is running.</p>'}
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
