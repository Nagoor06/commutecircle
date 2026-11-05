# Maps, messages and control audit

The November 2026 audit adds a dedicated Messages workspace without combining the
rider, driver, checkout, profile or sharing screens.

## Location selection

- Pickup and drop-off use the opposite selected point as a location bias. Driver
  intermediate stops use the previous stop. Profile uses the other commute point.
- Empty-field suggestions are public catalogue stops within 50 km, ordered by
  straight-line distance. Search farther away enables suggestions beyond 50 km.
- Ambiguous same-named stations remain separate when their coordinates differ.
  Provider caches include the selected anchor. There is no hard country boundary.
- Pin dragging and keyboard movement immediately retain the exact coordinates.
  Debounced Photon reverse lookup supplies a name and address. A result more than
  75 m away says “Near”; over 1 km is rejected. Failure shows coordinates and an
  explicit address-unavailable cue. Stale lookups are cancelled independently.
- Road previews refresh after moving either point. They remain estimates, with a
  straight-line fallback when routing is unavailable.
- Device GPS lookup still compares the public-stop catalogue locally. It does not
  reverse-geocode or upload raw device coordinates. Selected meeting points are
  sent to map/address/routing providers, explained beside the planner.

Photon source: https://github.com/komoot/photon/blob/master/docs/api-v1.md
The shared public Photon/OSRM instances offer no uptime guarantee. Provider
failures must never invent an address, route, ride, or fare.

## Messages

- `booking_messages` and `booking_chat_blocks` already persist private chat.
  Migration 0010 adds `booking_chat_reads` and a thread-order index.
- `GET /v1/me/conversations` is authenticated, paginated and supports unread-only
  filtering. Only the confirmed booking's rider and driver can see each entry.
- Preview queries return public stop names, booking reference, times, message text,
  participant role and unread count. They expose no identity subjects or contacts.
- A read acknowledgement names the last displayed message. It uses the same
  journey lock as sending and cancellation; delayed acknowledgements cannot move
  the cursor backwards or acknowledge messages arriving after the observed one.
- Blocking, cancellation and expiry close sending; history stays readable.
  Unpaid holds do not open chat. Existing contact-detail restrictions remain.
- The inbox refreshes while visible, with explicit retry and empty states.
  No push, SMS or email delivery is implied. Phone filtering is best effort and
  chat is not end-to-end encrypted.

## Controls and responsive checks

- Six navigation entries have short mobile labels and full accessible names.
- AC uses a snowflake, quiet ride a muted speaker, messages a speech bubble.
- Checkbox width is constrained; the filter's full-width input rule excludes it.
- Calendar inputs retain the native keyboard/mobile picker with a single icon.
- Desktop navigation wraps before colliding with account controls. The route map
  stays bounded and sticky when filters expand. Form columns can shrink safely.
- Public browsing, sign-in gates, driver publication, segment checkout, chat,
  favourite-contact trip sharing, and driver cancellation are exercised in CI.

Payments remain sandbox-only. This release does not activate hosted AI, change
Auth0 tenant policies, or send messages to real commuters during verification.
