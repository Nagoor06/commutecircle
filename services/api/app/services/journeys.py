"""Sandbox accounting. Every money or inventory mutation locks the journey first."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select, update

from app.models.journey import Journey, PaymentEntry, Ticket
from app.models.trip_share import TripShare
from app.services.notification_outbox import enqueue
from app.services.v2_common import verify_access


def utc(t):
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def fare(j, start, end):
    # Difference of rounded cumulative fares makes split tickets add to the full price.
    total = j.stops[-1]["metres"]

    def cumulative(i):
        return (2 * j.price_paise * j.stops[i]["metres"] + total) // (2 * total)

    return cumulative(end) - cumulative(start)


def pickup(j, i):
    return utc(j.departure) + timedelta(minutes=j.stops[i]["minutes"])


def fee(amount, remaining):
    percent = (
        0 if remaining >= timedelta(hours=24) else 10 if remaining >= timedelta(hours=2) else 25
    )
    return (amount * percent + 50) // 100


def locked(session, jid):
    journey = session.scalar(select(Journey).where(Journey.id == jid).with_for_update())
    if not journey:
        raise HTTPException(404, "Journey not found")
    return journey


def is_driver(j, p):
    return p is not None and (j.issuer, j.driver) == (p.issuer, p.subject)


def is_rider(t, p):
    return p is not None and (t.issuer, t.rider) == (p.issuer, p.subject)


def tickets(session, j):
    return list(session.scalars(select(Ticket).where(Ticket.journey_id == j.id)))


def status(t, now):
    return "expired" if t.state == "held" and utc(t.expires) <= now else t.state


def inventory(j, rows, now):
    free = [0 if j.cancelled else j.capacity] * (len(j.stops) - 1)
    if not j.cancelled:
        for t in rows:
            if status(t, now) in ("held", "paid", "exited"):
                for i in range(t.board, t.alight):
                    free[i] -= 1
    return free


def receipt(t, now):
    return dict(
        id=t.id,
        journey_id=t.journey_id,
        board=t.board,
        alight=t.alight,
        state=status(t, now),
        travel_state=t.travel_state,
        boarded_at=t.boarded_at,
        completed_at=t.completed_at,
        expires=utc(t.expires),
        stars=t.stars,
        fare_paise=t.fare,
        charged_paise=t.charged,
        refund_paise=t.refund,
        net_paise=t.charged - t.refund,
        currency="INR",
        payment_mode="sandbox",
    )


def quote(j, rows, data, now):
    if not 0 <= data.board < data.alight < len(j.stops):
        raise HTTPException(422, "Choose two stops in travel order")
    remaining = pickup(j, data.board) - now
    return dict(
        fare_paise=fare(j, data.board, data.alight),
        seats_available=(
            min(inventory(j, rows, now)[data.board : data.alight]) if remaining > timedelta() else 0
        ),
        passenger_fee_if_cancelled_now_paise=fee(fare(j, data.board, data.alight), remaining),
        pickup_at=pickup(j, data.board),
        currency="INR",
        payment_mode="sandbox",
    )


def hold(session, jid, p, data):
    with session.begin():
        j = locked(session, jid)
        now = datetime.now(UTC)
        verify_access(session, j, p)
        if j.booking_mode != "instant":
            raise HTTPException(409, "Request driver approval before checkout")
        if is_driver(j, p):
            raise HTTPException(409, "You listed this ride")
        prior = session.get(Ticket, str(data.checkout_id))
        if prior:
            if not is_rider(prior, p) or (prior.journey_id, prior.board, prior.alight) != (
                jid,
                data.board,
                data.alight,
            ):
                raise HTTPException(409, "Checkout ID already used")
            return receipt(prior, now)
        rows = tickets(session, j)
        # Recover the same reservation after a lost response or a browser reload.
        for existing in rows:
            if (
                is_rider(existing, p)
                and (existing.board, existing.alight) == (data.board, data.alight)
                and status(existing, now) in ("held", "paid")
            ):
                return receipt(existing, now)
        q = quote(j, rows, data, now)
        if not q["seats_available"]:
            raise HTTPException(409, "Seat unavailable. Nothing charged.")
        if any(
            is_rider(t, p)
            and status(t, now) in ("held", "paid")
            and t.board < data.alight
            and t.alight > data.board
            for t in rows
        ):
            raise HTTPException(409, "You already reserved this segment")
        t = Ticket(
            id=str(data.checkout_id),
            journey_id=jid,
            issuer=p.issuer,
            rider=p.subject,
            board=data.board,
            alight=data.alight,
            state="held",
            fare=q["fare_paise"],
            expires=min(now + timedelta(minutes=3), q["pickup_at"]),
        )
        session.add(t)
        session.flush()
        return receipt(t, now)


def refund_to(session, ticket, amount, kind, now):
    """Append only the increase; the journey lock serializes all financial changes."""
    delta = amount - ticket.refund
    if delta > 0:
        session.add(PaymentEntry(ticket_id=ticket.id, kind=kind, amount=delta, created_at=now))
        ticket.refund = amount


def revoke_location(session, jid, tid=None):
    statement = update(TripShare).where(TripShare.journey_id == jid)
    if tid:
        statement = statement.where(TripShare.ticket_id == tid)
    session.execute(
        statement.values(
            revoked=True,
            latitude=None,
            longitude=None,
            accuracy_m=None,
            observed_at=None,
            updated_at=None,
        )
    )


def act(session, jid, tid, p, action, stop=None, max_fee_paise=None):
    with session.begin():
        j = locked(session, jid)
        now = datetime.now(UTC)
        t = session.get(Ticket, tid)
        if not t or t.journey_id != jid or not (is_rider(t, p) or is_driver(j, p)):
            raise HTTPException(404, "Reservation not found")
        state = status(t, now)
        if action == "pay":
            if not is_rider(t, p):
                raise HTTPException(403, "Only the passenger can pay")
            if state == "paid":
                return receipt(t, now)
            if state != "held" or j.cancelled:
                raise HTTPException(409, "Checkout closed. Nothing charged.")
            if min(inventory(j, tickets(session, j), now)[t.board : t.alight]) < 0:
                raise HTTPException(409, "Seat inventory changed. Nothing charged.")
            session.add(PaymentEntry(ticket_id=t.id, kind="charge", amount=t.fare, created_at=now))
            t.charged = t.fare
            t.state = "paid"
        elif action == "cancel":
            if state == "requested":
                t.state = "driver_cancelled" if is_driver(j, p) else "rider_cancelled"
                return receipt(t, now)
            if t.travel_state == "boarded":
                raise HTTPException(
                    409, "Boarded passenger requires an incident or interruption workflow"
                )
            if state == "rider_cancelled" and is_driver(j, p):
                refund_to(session, t, t.charged, "driver_refund", now)
                t.state = "driver_cancelled"
                enqueue(session, j, t, now)
                return receipt(t, now)
            if state in ("driver_cancelled", "rider_cancelled", "expired"):
                return receipt(t, now)
            remaining = pickup(j, t.board) - now
            if remaining <= timedelta():
                raise HTTPException(409, "Boarding time has passed")
            driver = is_driver(j, p)
            charge = 0 if driver else fee(t.charged, remaining)
            if max_fee_paise is not None and charge > max_fee_paise:
                raise HTTPException(
                    409, "Cancellation fee changed. Review the new fee before cancelling."
                )
            refund_to(
                session, t, t.charged - charge, "driver_refund" if driver else "rider_refund", now
            )
            t.state = "driver_cancelled" if driver else "rider_cancelled"
            revoke_location(session, jid, tid)
        elif action == "exit":
            if t.travel_state == "completed":
                raise HTTPException(409, "Completed booking cannot change exit")
            if not is_driver(j, p):
                raise HTTPException(403, "Driver must confirm the actual exit")
            if state in ("paid", "exited") and stop == t.alight:
                return receipt(t, now)
            if (
                state != "paid"
                or not t.board < stop < t.alight
                or now < pickup(j, t.board)
                or now >= pickup(j, t.alight)
            ):
                raise HTTPException(409, "Requires an onboard passenger and an earlier route stop")
            t.state = "exited"
            revoke_location(session, jid, tid)
            t.alight = stop
            refund_to(session, t, t.charged - fare(j, t.board, stop), "exit_refund", now)
        enqueue(session, j, t, now)
        return receipt(t, now)


def cancel_all(session, jid, p):
    with session.begin():
        j = locked(session, jid)
        if not is_driver(j, p):
            raise HTTPException(404, "Journey not found")
        if not j.cancelled:
            now = datetime.now(UTC)
            if now >= utc(j.departure):
                raise HTTPException(409, "Journey has started")
            for t in tickets(session, j):
                if status(t, now) in ("held", "paid", "exited", "rider_cancelled"):
                    # A cancelled ride cannot retain a passenger cancellation fee,
                    # including when the two cancellation requests race.
                    refund_to(session, t, t.charged, "driver_refund", now)
                    t.state = "driver_cancelled"
                    enqueue(session, j, t, now)
            j.cancelled = True
            revoke_location(session, jid)
    return {"cancelled": True}
