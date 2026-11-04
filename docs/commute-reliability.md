# Private commute and checkout reliability

**Share the journey. Keep your world private.**

## Access and privacy

Priced-journey discovery, search, details and quotes accept guests. Supplied bearer tokens are still verified. Public projections exclude identities, tickets and private commute preferences. All `/v1/` responses are `no-store`. Booking, publishing, cancellation, reviews, profiles and chat require authenticated scopes.

Read-only ride search retries transient connection/502/503/504 failures up to two times, with visible recovery text and a bounded total wait of about one minute. Changing stops, filters or screens cancels the request and any pending retry. Authentication and validation errors are not retried. Booking and payment operations do not use this automatic recovery. Browsing all routes preserves the selected calendar date and other filters.

`/v1/me/commute` uses an atomic upsert keyed by issuer and subject. Only that account can read/delete its public nodal pickup, office-area point and optional employer label. There is no residence field. Users confirm that selected points are public; software cannot certify this from an arbitrary pin.

Nearby-stop lookup downloads the CC0 DataMeet catalogue and computes distance in the browser. Raw device coordinates are never used as the pickup pin or sent to the booking server. The user chooses a public suggestion. Typed queries and selected routing stops still reach the configured Photon/OSRM providers. Public points are not safety certifications.

## Seat and payment integrity

Every mutation locks the journey with PostgreSQL `SELECT FOR UPDATE`, then checks time and inventory. Half-open leg intervals allow A–B and B–C to reuse a seat. Holds expire at the earlier of three minutes and boarding. A quote does not reserve inventory; expired and losing checkouts cannot pay.

Exact segment retries recover the same passenger's active ticket after a lost response. Ticket state, charge/refund balances and journal entries commit together. Unique ticket/entry-kind keys prevent duplicate charges. Driver cancellation also refunds a passenger cancellation fee already recorded, making simultaneous cancellation fair in either execution order. Migration 0008 backfills existing sandbox balances.

CI uses real PostgreSQL for eight last-seat contenders, duplicate payments, payment/cancellation races, expired-hold replacement and simultaneous driver/passenger cancellation. SQLite skips these tests. See [PostgreSQL locking](https://www.postgresql.org/docs/17/explicit-locking.html).

Money remains sandbox-only. A real provider must be integrated separately with idempotent intents created only after a winning hold, signed webhooks, in-flight reservation handling, and reconciliation of late success/refunds. A provider transaction is not atomic with our database; see the [capture lifecycle](https://docs.stripe.com/api/payment_intents/capture).

## Matching and route calculation

Filters apply before pagination. Recommended ranking prioritizes the account's saved public nodal-to-office segment and explains that match without publishing the employer. Segment fares use differences of rounded cumulative road-distance fares. Independent pickup/drop-off radii and closest-arrival sorting label the actual straight-line gap; they do not imply a walking route.

Drivers calculate road-leg distances/times with OSRM. An optional two-stop route finder projects catalogue points onto road geometry, suggests public intermediate stops, then recalculates through those points. The driver reviews the route and estimated timing. Failure leaves manual measured entry available. Estimates are not traffic-aware.

A Tenali–Vijayawada listing must include Mangalagiri as a reviewed stop for an actual Tenali–Mangalagiri ticket. Wider filters may instead display an explicitly labelled alternative drop-off. Matching never promises an unapproved detour or travel beyond the final listed stop.

## Booking chat

Confirmed tickets open passenger/driver chat. Every request checks membership. There is no phone directory, public identity handle, file upload or clickable link. Server checks normalize Unicode and reject common numbers, English number words, email/link/handle patterns and short split-number attempts. Filtering cannot catch every disguised exchange or language.

Message IDs are idempotent. Writes lock the journey, enforce five messages per sender per 30 seconds and cap each booking at 200 messages. The UI displays the latest 100 and refreshes while visible. Either participant can permanently block chat without cancelling. Cancellation and 24 hours after drop-off make chat read-only. Messages are stored server-side, not end-to-end encrypted. No staffed emergency response or moderation service is implied.

## Ollama, RAG and MCP

The optional local assistant uses all-minilm embeddings, SQLite-vec and LangGraph privacy/retrieve/select/abstain nodes. Model output selects a versioned guide passage; displayed answers and citations come from that source. Obvious personal contact/home details are blocked before question embedding. Unrelated questions abstain. The updated guide covers all new flows.

The pinned official MCP SDK exposes read-only stdio tools `read_rider_guide`, `ask_rider_guide` and `search_public_rides`. It has no credentials or booking/payment/chat/profile write tools. Local model failures return explicit unavailable results. Tests run a real MCP initialize/list/call exchange; CI also runs actual Ollama inference.

Install `services/ride-help/requirements.txt` and configure an MCP host to run `python /absolute/path/to/services/ride-help/mcp_server.py`, with `OLLAMA_HOST_URL=http://localhost:11434`. Pull `all-minilm` and `qwen2.5:0.5b` first. `COMMUTECIRCLE_API_ORIGIN` optionally selects another public catalogue origin. The app uses `compose.ride-help.yaml` and `RIDE_HELP_URL`. Staging has no hosted model worker until one is configured; the public guide remains available.

## Research behind the choices

These are individual reports, not prevalence estimates, and are excluded from the policy RAG corpus.

- [Bengaluru carpool discussion](https://www.reddit.com/r/bangalore/comments/1lpknp5/car_pool_is_picking_up_but_its_still_10_in/): last-mile distance and disagreements about calls/noise informed proximity filters and quiet-ride preferences.
- [Reported drop-off/privacy experience](https://www.reddit.com/r/Bengaluru/comments/1kfwxss): personal questions and an unexpected drop point informed public nodal pickups, explicit stop receipts and private booking chat.
- [Last-minute cancellation discussion](https://www.reddit.com/r/uber/comments/146kg68/is_there_a_reason_drivers_cancel_at_the_literal/): replacement difficulties informed full-refund handling and Find another ride. A replacement is not guaranteed.
- [Fare complaint on X](https://x.com/tanjinayas27302/status/2067642115954536601): a reported quote/collection mismatch supports visible fares and balances. Search exposed the post; full X context was unavailable.

## Auth0 registration wording

The dedicated sign-in screen explains the redirect, offers login/signup and gives recovery guidance without inventing an account-exists error. The current public Native client uses Authorization Code + PKCE, with callback `https://nagoor06.github.io/commutecircle/`.

[Auth0's official instructions](https://support.auth0.com/center/s/article/How-to-Show-a-Specific-Error-Message-When-a-User-Signs-Up-with-an-Existing-Email) identify Tenant Settings → Advanced → “Use a generic response in public signup API error message.” Disabling it permits an account-exists response and email enumeration. This release does not change that tenant-wide setting; neutral account-recovery guidance works with it enabled.
