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
  paid: 'Booked',
  exited: 'Trip finished',
  expired: 'Hold expired',
  driver_cancelled: 'Driver cancelled',
  rider_cancelled: 'Passenger cancelled'
};
