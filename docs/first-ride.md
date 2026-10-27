# Create your first local demo ride

Prerequisite: real Auth0 sign-in works in /docs and GET /v1/rides/mine returns 200.

1. Pull main in GitHub Desktop and run `docker compose up -d --build` from the repository root.
2. Run this only against your local demo database:

```powershell
docker compose exec api python -m app.cli.seed_demo --confirm-demo
```

The command inserts two synthetic points in **DemoCity**, explicitly named **DEMO ONLY - Pickup A/B**. Their coordinates are fictional and not intended for travel. It prints the actual allocated database IDs and an `example_ride` JSON object with departure two hours ahead. Do not assume IDs are 1 and 2. Copy only the contents of `example_ride` for the POST body.

Repeat runs reuse the same points and do not overwrite other rows. Conflicting demo names/coordinates abort the transaction. Run one seed process at a time; this is a local setup command, not a concurrent importer. The command performs no HTTP write and requires database access. It never runs automatically at startup or in migrations. Do not run it against production.

3. Open http://localhost:8000/docs and Authorize again if needed.
4. Execute GET /v1/pickup-points with city `DemoCity`; expect the two points.
5. Execute POST /v1/rides with the printed `example_ride` body; expect 201 and a ride ID. The timestamp must still be future. Re-run the seed command for a fresh example if needed. Do not repeatedly POST the same example: offer creation is not idempotent yet.
6. Execute GET /v1/rides/mine; expect your new offer in the list.
7. Execute GET /v1/rides with the actual origin_id and destination_id. Leave after/before blank to search the next 24 hours; expect the newly created ride (while its departure remains in the future).

Report only status codes and response bodies. Do not share Swagger's generated curl command containing its Authorization header. A created offer does not reserve a seat: requests/approval/cancellation are the next milestone.

Before a real pilot, choose a city and curate verified public meeting points. The demo fixtures are not that dataset.
