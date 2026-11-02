# CommuteCircle rider guide

## Last seat
A pending seat request does not reserve a seat. If two approvals compete for the last seat, exactly one succeeds. The other request stays pending until a seat becomes available or the driver closes the ride.

## Driver cancellation
When the driver cancels an upcoming ride, every pending and accepted booking on that ride is cancelled together. The ride disappears from search. Cancelling an individual passenger booking affects only that booking.

## Passenger cancellation
A passenger may cancel their own pending or accepted booking before departure. Cancelling an accepted booking restores one seat. Retrying the cancellation does not restore an extra seat.

## Booking commitment
The ₹20 commitment shown in the public booking lab uses demo money. There is no payment, card charge or real refund in that simulation.

## Pickup directions
Pickup and drop-off share a street map with two independently draggable pins. You can also search by place name, enter coordinates, or use device location. The meeting card combines the pickup pin with a public landmark or entrance you enter.

## Driver reviews
A passenger with an accepted booking can rate their driver after departure. Updating that review replaces their earlier score. A driver without reviews is shown as unrated.

## Vehicle condition
The vehicle card can show make, model, colour, purchase date and driver-reported condition. Purchase date is when the driver bought the car. It does not certify mechanical condition.

## Priced journey checkout
Drivers list public stops in travel order and set a full-route price per seat. A passenger pays only for their booked distance. A three-minute hold reserves only the overlapping legs and expires by boarding time. The public fare preview and authenticated checkout use sandbox money.

## Priced journey refunds
Before boarding, passengers pay no cancellation fee at least 24 hours ahead, 10% from 2 to under 24 hours, and 25% under 2 hours. These percentages apply to the paid segment fare. When the driver cancels an active ticket before boarding, its full sandbox charge is refunded. A driver-confirmed early exit refunds the unused distance.
