"""Sandbox accounting. Every money or inventory mutation locks the journey first."""

from datetime import UTC, datetime, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.models.journey import Journey, Ticket


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
    return (j.issuer, j.driver) == (p.issuer, p.subject)


def is_rider(t, p):
    return (t.issuer, t.rider) == (p.issuer, p.subject)


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
        expires=utc(t.expires),
        fare_paise=t.fare,
        charged_paise=t.charged,
        refund_paise=t.refund,
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


def act(session, jid, tid, p, action, stop=None):
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
            t.charged = t.fare
            t.state = "paid"
        elif action == "cancel":
            if state in ("driver_cancelled", "rider_cancelled", "expired"):
                return receipt(t, now)
            remaining = pickup(j, t.board) - now
            if remaining <= timedelta():
                raise HTTPException(409, "Boarding time has passed")
            driver = is_driver(j, p)
            t.refund = t.charged - (0 if driver else fee(t.charged, remaining))
            t.state = "driver_cancelled" if driver else "rider_cancelled"
        elif action == "exit":
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
            t.alight = stop
            t.refund = t.charged - fare(j, t.board, stop)
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
                if status(t, now) in ("held", "paid", "exited"):
                    t.refund = t.charged
                    t.state = "driver_cancelled"
            j.cancelled = True
    return {"cancelled": True}
