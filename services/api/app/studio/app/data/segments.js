export const pickupAt = (j, i) => new Date(Date.parse(j.departure) + j.stops[i].minutes * 60000);
export function fare(j, a, b) {
  const total = j.stops.at(-1).metres;
  const at = i => Math.floor((2 * j.price_paise * j.stops[i].metres + total) / (2 * total));
  return at(b) - at(a);
}
export function free(j, a, b) {
  return a >= 0 && b > a && b < j.stops.length ? Math.min(...j.free.slice(a, b)) : 0
}
export function validIndices(j, a, b) {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b <= a || b >= j.stops.length) throw Error(
    'Choose a drop-off after the boarding stop.');
}
export const ticketLabel = {
  held: 'Awaiting payment',
  requested: 'Waiting for driver approval',
  paid: 'Booked',
  exited: 'Trip finished',
  expired: 'Hold expired',
  driver_cancelled: 'Driver cancelled',
  rider_cancelled: 'Passenger cancelled'
};

export function ticketProgress(journey, ticket, now = Date.now()) {
  const pickup = +pickupAt(journey, ticket.board);
  const dropoff = +pickupAt(journey, ticket.alight);
  const paid = ticket.state === 'paid';
  const awaiting = paid && ticket.travel_state === 'awaiting_boarding';
  const boarded = ticket.travel_state === 'boarded';
  const completed = ticket.travel_state === 'completed';
  const missed = awaiting && now >= Math.max(dropoff, pickup + 45 * 60000);
  const finished = completed || (!ticket.travel_state &&
    (ticket.state === 'exited' || (paid && now >= dropoff)));
  return {
    label: ticket.declined ? 'Request declined' : finished ? 'Completed' : missed ? 'Boarding not recorded' :
      boarded ? (ticket.state === 'exited' ? 'Exited early' : 'Boarded') : ticketLabel[ticket.state],
    past: finished || missed || ['expired', 'driver_cancelled', 'rider_cancelled'].includes(ticket.state),
    board: awaiting && !journey.cancelled && now >= pickup - 30 * 60000 && now < pickup + 45 * 60000,
    complete: boarded && (ticket.state === 'exited' || (paid && now >= dropoff)) && now >= pickup,
    cancel: !journey.cancelled && !boarded && !completed && now < pickup &&
      ['requested', 'held', 'paid'].includes(ticket.state),
    exit: paid && (!ticket.travel_state || boarded) && now >= pickup && now < dropoff &&
      ticket.alight - ticket.board > 1,
    share: paid && !completed && !journey.cancelled && now >= pickup - 3600000 && now < dropoff + 3600000,
    chat: ticket.confirmed ?? Boolean(ticket.charged_paise)
  };
}
