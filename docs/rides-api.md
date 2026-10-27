# Ride offers and search

Send `Authorization: Bearer <provider-issued-access-token>` for each route.

| Endpoint | Scope | Behavior |
|---|---|---|
| POST `/v1/rides` | rides:write | Create a future offer between existing public pickup points |
| GET `/v1/rides` | rides:read | Filter future offers by origin, destination, time and seats |
| GET `/v1/rides/mine` | rides:read | List only the caller's own offers |

Example create body (IDs must exist; date must still be in the future):

```json
{"origin_id":1,"destination_id":2,"departure_at":"2027-01-15T08:30:00+05:30","seats_available":3}
```

The database starts empty; illustrative IDs are not seeded locations. Origin and destination must differ, seats must be an integer 1–8, and departure requires an explicit timezone. Extra fields such as driver identity or home address are rejected. Timestamps are normalized to UTC.

Search requires `origin_id` and `destination_id`. Optional: `after`, `before`, `seats` (1), `limit` (20, maximum 100), `offset` (0). The start is inclusive and end exclusive. Past departures are excluded. Default window is the next 24 hours; explicit windows must be positive and no longer than seven days. Results sort by departure then ride ID. Offset pagination is not a frozen snapshot.

Only ride ID, public point IDs, departure and seats are returned. Search uses exact pickup-point matching, not geospatial route overlap.

Routes handle HTTP/auth; services own business rules and transaction boundaries; repositories perform queries. Database constraints also enforce seats, different endpoints and point foreign keys.

Booking, cancellation, recurring rides, payments, duplicate-submit idempotency and mobile screens are not implemented. An offer is not a reservation. Avoid blindly retrying an uncertain POST until idempotency is implemented. Booking will add capacity/status rules, support for zero remaining seats and atomic allocation in a separate migration.
