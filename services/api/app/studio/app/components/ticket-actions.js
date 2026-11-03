import {
  confirmation,
  money
} from '../ui.js';
export async function cancelTicket(api, j, t) {
  const quote = await api.quote(j.id, t.board, t.alight);
  const fee = j.owner || !t.charged_paise ? 0 : quote.passenger_fee_if_cancelled_now_paise;
  const ok = await confirmation(j.owner ? 'Cancel this passenger’s seat?' : 'Cancel this reservation?',
    'Cancellation fee ' + money(fee) + '. Sandbox refund ' + money(t.charged_paise - fee) +
    '. The reserved legs will reopen.',
    'Cancel reservation', {
      danger: true
    });
  if (!ok) return false;
  await api.cancelTicket(j.id, t.id, fee);
  return true;
}
export async function cancelJourney(api, j) {
  if (!await confirmation('Cancel this entire ride?',
      'All active reservations will close and paid passengers will receive a full sandbox refund.',
      'Cancel ride', {
        danger: true
      })) return false;
  await api.cancelRide(j.id);
  return true;
}
