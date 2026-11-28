/** @param {string} value */
export function travellerName(value) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * @param {{board:number, alight:number, guest_name?:string|null, state:string, expires:string}} ticket
 * @param {number} board
 * @param {number} alight
 * @param {string|null} name
 */
export function activeReservation(ticket, board, alight, name, now = Date.now()) {
  if (ticket.board !== board || ticket.alight !== alight) return false;
  if ((ticket.guest_name?.toLowerCase() ?? null) !== (name?.toLowerCase() ?? null)) return false;
  return ticket.state === 'paid' ||
    (['requested', 'held'].includes(ticket.state) && Date.parse(ticket.expires) > now);
}

/**
 * Only public stop names and the local pickup time belong in the guest handoff.
 * @param {string} name
 * @param {string} pickup
 * @param {string} dropoff
 * @param {Date} when
 */
export function guestItinerary(name, pickup, dropoff, when) {
  const time = when.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  });
  return `CommuteCircle ride for ${name}\nPickup: ${pickup} · ${time}\nDrop-off: ${dropoff}`;
}
