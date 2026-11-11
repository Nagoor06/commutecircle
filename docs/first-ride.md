# Book your first local ride

Start the stack from the repository root with `docker compose up -d --build`. Open [Studio](http://localhost:8000/studio/). Use two separate browser profiles or a private window so the driver and passenger can stay signed in to different accounts.

1. As the driver, open **Offer a ride**. Choose two public meeting points, a future departure, one seat and a full-route fare. Calculate the times or enter increasing distances and minutes manually. Choose **Instant sandbox checkout**, review the offer and publish.
2. Open **My trips → Driving** and select **View itinerary**. Copy that ride URL into the passenger window, or use **Book a ride** with the same date and stops.
3. As the passenger, choose the boarding and exit stops, select **Hold one seat**, then pay the displayed fare in sandbox. The receipt shows the amount charged. **My trips → Riding** opens the same receipt.
4. Refresh the driver's **Driving** tab and expand **Passenger reservations**. To test a refund, cancel the ride before pickup. The passenger receipt should then show **Driver cancelled**, a full sandbox refund and a link to find another ride.

## Try a driver-approved ride

As the driver, submit your case reference and vehicle under **Profile → Driver & vehicle verification**. An independently authorized reviewer signs in at [staff review](http://localhost:8000/studio/#/staff) and reviews both submissions. Publish a new ride using **Driver-approved requests** and the approved vehicle. The passenger selects the segment and accepts the displayed fare and pickup. The driver approves in **My trips → Driving**, then the passenger pays from the receipt. The boarding PIN opens 30 minutes before pickup. After the driver confirms boarding, the passenger can confirm completion after drop-off or a driver-confirmed early exit.

## Check the same data in Swagger

Use `POST /v1/journeys` to publish and `POST /v1/journeys/search` to find a Studio journey. Sign in as the relevant account and use `GET /v1/journeys/mine` to inspect its tickets. The itinerary URL contains the journey ID.

The older `/v1/rides` endpoints use pickup-point IDs and their own booking records. Existing records appear under **Earlier driver-approved offers** or **Earlier seat requests** in My trips. For a local legacy API test, `docker compose exec api python -m app.cli.seed_demo --confirm-demo` prints two synthetic points and an example request. Studio journeys require no seed command.
