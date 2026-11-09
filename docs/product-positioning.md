# CommuteCircle: planned journeys, private routines

**Share the journey. Keep your world private.**

CommuteCircle helps people share seats on journeys drivers already plan to make.
The current product combines public meeting points, private office commute
preferences, distance-based segment fares and availability on each route leg.
A Tenali–Mangalagiri passenger can book part of a Tenali–Vijayawada journey; the
onward segment remains bookable. Personal contacts remain out of booking chat.
Live sharing is explicit, revocable and expires; it is not permanent surveillance.

These features are a product focus, not evidence that we invented carpooling.
Quick Ride already advertises route matching, recurring office rides, company
filters, fares chosen by drivers and live tracking. BlaBlaCar already supports
planned journeys, stopovers and per-leg contributions, with cancellation alerts.
Comparing only with Uber or Rapido would miss our closest competitors. AI, RAG,
maps and notification channels are tools; they are not a defensible novelty alone.

Our hypothesis is that a coherent privacy promise and reliable segment booking
can serve recurring commuters on underserved corridors. Validate that hypothesis
with real commuters; do not claim competitors lack something merely because it
wasn't visible on a marketing page.

| Current implementation | Further validation or work |
| --- | --- |
| Public meeting points; private office labels | Audit how users choose points; no assertion that suggested stops are verified safe |
| Proportional segment fares and seat reuse | Real payment gateway and reconciliation; current accounting is sandbox |
| Chat contact-detail filtering | Abuse reporting/moderation operations; filters can be bypassed |
| Opt-in, expiring live GPS | Mobile background reliability; browser GPS can pause |
| Booking alert outbox and verified contact settings | Activate providers, collect delivery receipts, always-on operations |
| Saved commute and manual scheduled offers | Recurring circles, verified workplace membership and recovery after cancellations remain future work |

Pilot one corridor before adding more general taxi features. Measure the share of
searches with a usable match, fulfilled booked segments, driver cancellations,
weekly repeat riders, utilisation per route leg and on-time alert delivery. The
proof would be repeat usage and dependable fulfilment, not a longer feature list.

Sources checked 2026-11-07:

- https://www.quickride.in/
- https://www.blablacar.in/offer-seats
