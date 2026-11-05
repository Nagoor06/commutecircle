# CommuteCircle rider guide

## Last seat
For priced journeys, a hold reserves the selected legs for up to three minutes, ending at boarding time if sooner. When two riders compete for the last overlapping seat, only one hold succeeds. The losing request cannot pay. Repeated payment requests for the same ticket create one sandbox charge. Expired holds cannot be paid. Earlier driver-approved offers use a separate pending-request flow: only an accepted request reserves a seat.

## Driver cancellation
When the driver cancels an upcoming priced journey, active tickets are cancelled together and the ride disappears from search. Paid tickets get a full sandbox refund, including a passenger cancellation fee already recorded on that journey. Unpaid tickets have no charge. Open the receipt and choose Find another ride to search the same public stops. Replacement availability is not guaranteed. Cancelling one passenger ticket affects that ticket; cancelling the journey closes all its tickets.

## Passenger cancellation
Cancel a priced ticket from its receipt before pickup. At least 24 hours before pickup is free; from 2 to under 24 hours the fee is 10%; under 2 hours it is 25% of the paid segment fare. The app shows the fee before confirmation. If the fee changes, confirmation fails so the passenger can review it. Retrying does not charge or refund twice. Unpaid holds have no cancellation fee.

## Booking commitment
CommuteCircle currently uses sandbox money. It does not collect a ₹20 deposit, debit a card or move bank funds. Sandbox charges and refunds are recorded in a transactional ledger alongside the seat changes. Real payments require a separately configured payment provider, verified webhooks and reconciliation before launch.

## Circle pickup privacy
Use a public station, bus stop or agreed landmark as your pickup and office-area meeting point. There is no home-address field. Find public stops near me compares device location with a downloaded public-station catalogue inside the browser; exact device coordinates are not sent to the booking server or used as the pickup pin. You choose a suggested public point. A point being in the catalogue does not certify lighting, access or safety. Manually selected pins are shared as meeting points, so do not place them at home.

## Workplace commute matching
Save your public nodal pickup, office-area meeting point and optional employer label in Profile. Only you can read or delete those preferences. The employer label is not published on rides. Best commute match ranks available ordered segments between your public points first. Ranking does not verify employment, company membership or driver trustworthiness.

## Share a trip with favourite contacts
Save up to five favourite contacts in Profile. In My trips or a confirmed receipt, choose Share my trip, agree to share precise location, and allow browser location access. Send the private link yourself through your device share menu, text or email composer. Anyone with the link can view the latest location without an account; it does not show your phone, employer or contacts. Sharing opens one hour before pickup, lasts at most four hours and ends by one hour after drop-off. Stop sharing revokes access; cancellation and confirmed early exit also end it. Updates older than one minute are labelled paused, and five minutes without updates ends the link. Keep the app open because phone browsers can pause GPS in the background. Closing or reloading attempts to revoke the link; without connectivity it can remain accessible for up to five minutes. This is not emergency monitoring. Never paste the link or coordinates into chat or the AI helper.

## Browse and filter rides
No sign-in is needed to search available rides, read their itinerary or view a fare quote. Booking, offering rides, saving a profile and chat require sign-in. Choose a travel date from the calendar. Filters include segment fare, pickup and drop-off proximity, available seats, driver rating, quiet rides and air conditioning. Closest drop-off sorts by straight-line distance to the requested destination, not walking distance. Wider drop-off filters can include rides that stop short of or farther from the requested destination. Check the actual meeting point before booking.

## Intermediate stops and fares
Drivers can calculate road distances and estimated times between mapped stops. For a two-stop route they can add suggested public intermediate stops, then review the changed route before publishing. A Tenali to Vijayawada offer that includes Mangalagiri can be booked from Tenali to Mangalagiri, with a fare proportional to that booked road distance. The onward legs stay available. The passenger cannot book past the listed final stop. Route-provider failure leaves manual distance and time entry available; estimates do not include live traffic.

## Booking chat
After a confirmed priced booking, the passenger and driver can use Booking chat in My trips or Message driver on the receipt. Their personal phone numbers, employer labels and login identifiers are not shown. Common phone numbers, Unicode digits, number words, emails, contact links and handles are rejected; attachments are not supported. Filtering cannot detect every disguised exchange. Messages are stored by CommuteCircle and are not end-to-end encrypted. Either participant can permanently block further messages for that booking without cancelling it. Cancelled bookings and conversations more than 24 hours after drop-off become read-only. Refresh messages retries a failed connection.

## Pickup directions
Pickup and drop-off share a street map with independently draggable pins. Search by place name, use coordinates for a public meeting point, or select a nearby public stop. The meeting card can combine the selected public pickup with a landmark you enter. Do not put a residence, phone number or private entrance in the note.

## Driver reviews
A passenger with a paid priced segment can rate the driver after its scheduled drop-off, or after a driver-confirmed early exit. Updating the review replaces the earlier score. A driver without reviews is shown as unrated. Ratings do not certify identity or safety.

## Vehicle condition
The vehicle card can show make, model, colour, purchase date and driver-reported condition. Quiet ride and air conditioning preferences are driver-reported. Purchase date is when the driver bought the car and does not certify mechanical condition.

## Priced journey checkout
Drivers list public stops in travel order and set a full-route price per seat. The passenger pays only for the booked distance. Seats are checked on every overlapping leg, and a database lock serializes holds, payments, cancellations and exits. The quoted fare alone does not reserve a seat. A hold and payment require sign-in.

## Priced journey refunds
A driver-confirmed early exit refunds the unused distance and makes the onward legs available again. Passenger cancellation fees depend on time before pickup; driver cancellation refunds the full sandbox charge. A receipt shows the charged and refunded amounts. Real bank refund timings are not applicable to sandbox checkout.

## Live vehicle location and nearby suggestions

From a confirmed booking, choose Track vehicle. The driver must explicitly start
location sharing and separately allow confirmed passengers. The viewer chooses
Show live map; tiles reveal the viewed area to OpenFreeMap but never the private
link. A car marker represents driver-device GPS, while a rider's own share link
uses a person marker. The page polls every five seconds while visible, shows
accuracy and update age, and marks stale or disconnected updates as paused. No
movement is predicted after the last received fix. Cancelling or exiting a ticket
removes its tracking access; driver cancellation ends sharing for everyone.

Pickup and drop-off suggestions default to within 50 km of the opposite stop,
measured in a straight line. Choose Search farther away to find distant places.
This suggestion radius does not limit the trip distance. No private live GPS
coordinates, share tokens or trusted-contact details belong in the AI helper.
