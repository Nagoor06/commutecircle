import {confirmation, money} from '../ui.js';

export async function cancelTicket(api, j, t, signal) {
  const paid=t.charged_paise;
  let fee=0;
  if(!j.owner && paid){
    const quote=await api.quote(j.id,t.board,t.alight,signal);
    fee=quote.passenger_fee_if_cancelled_now_paise;
  }
  if(signal.aborted)return false;
  const message=t.state==='requested'?'The pending request will close. No seat has been reserved.':
    'The reserved seat will reopen for this segment.';
  const details=paid?[['Sandbox charge',money(paid)],['Cancellation fee',money(fee)],['Sandbox refund',money(paid-fee)]]:[['Amount charged',money(0)]];
  if(!await confirmation(j.owner?'Cancel this passenger’s seat?':'Cancel this reservation?',message,'Cancel reservation',{danger:true,signal,details}))return false;
  await api.cancelTicket(j.id,t.id,fee);
  return true;
}
export async function cancelJourney(api, j, signal) {
  if(!await confirmation('Cancel this entire ride?',
    'Active reservations will close and paid passengers will receive a full sandbox refund.',
    'Cancel ride',{danger:true,signal,details:[['From',j.stops[0].name],['To',j.stops.at(-1).name]]}))return false;
  await api.cancelRide(j.id);
  return true;
}
