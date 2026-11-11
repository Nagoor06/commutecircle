import {recoverSearch} from './search-recovery.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status
  }
}
export function liveClient(token, origin, onSessionExpired) {
  async function call(path, method = 'GET', data, options = {}) {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const timer = setTimeout(cancel, options.timeout || 18000);
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, {once: true});
    try {
      const response = await fetch(origin + path, {
        method,
        credentials: 'same-origin',
        headers: {
          ...(token ? {Authorization: 'Bearer ' + token} : {}),
          ...(data ? {
            'Content-Type': 'application/json'
          } : {})
        },
        body: data ? JSON.stringify(data) : undefined,
        keepalive: !!options.keepalive,
        signal: controller.signal
      });
      if (!response.ok) {
        if (response.status === 401 && token && onSessionExpired) {
          token = null;
          onSessionExpired();
        }
        const body = await response.json().catch(() => ({})), detail = body.detail;
        const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(v => v.msg)
          .slice(0, 2).join(' · ') : 'Request could not be completed.';
        throw new ApiError(response.status, response.status === 401 ?
          'Session ended. Sign in again to continue.' : message);
      }
      return await response.json();
    } catch (error) {
      if (options.signal?.aborted || error instanceof ApiError) throw error;
      if (controller.signal.aborted) throw new ApiError(0, 'The booking service took too long. Try again.');
      throw new ApiError(0, 'The service could not be reached. Try again.');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }
  async function pages(path, signal, size = 50) {
    const rows = [];
    for (let offset = 0;; offset += size) {
      const page = await call(path + (path.includes('?') ? '&' : '?') + 'offset=' + offset, 'GET', null, {signal});
      rows.push(...page);
      if (page.length < size) return rows;
    }
  }
  const path = id => '/v1/journeys/' + encodeURIComponent(id);
  const ticket = (id, tid) => path(id) + '/tickets/' + encodeURIComponent(tid);
  return {
    mode: 'live',
    staffDrivers: signal => call('/v1/staff/driver-verifications','GET',null,{signal}),
    staffVehicles: signal => call('/v1/staff/vehicles','GET',null,{signal}),
    staffReports: signal => call('/v1/staff/safety-reports','GET',null,{signal}),
    staffDriverDecision: (id,decision) => call('/v1/staff/driver-verifications/'+encodeURIComponent(id)+'/decision','POST',{decision}),
    staffVehicleDecision: (id,decision) => call('/v1/staff/vehicles/'+encodeURIComponent(id)+'/decision','POST',{decision}),
    staffReviewCase: (id,data) => call('/v1/staff/safety-reports/'+encodeURIComponent(id)+'/review','POST',data),
    profile: signal => call('/v1/me/profile','GET',null,{signal}),
    saveProfile: data => call('/v1/me/profile','PUT',data),
    driverEligibility: signal => call('/v1/me/driver-eligibility','GET',null,{signal}),
    submitDriverVerification: data => call('/v1/me/driver-verification','POST',data),
    submitVehicle: data => call('/v1/me/vehicles','POST',data),
    requests: (id,signal) => call(path(id)+'/requests','GET',null,{signal}),
    requestSeat: (id,board,alight,key) => call(path(id)+'/requests','POST',{request_id:key,board,alight,consent:true,consent_version:'cc-v2-1'}),
    approve: (id,tid) => call(ticket(id,tid)+'/approve','POST'),
    decline: (id,tid) => call(ticket(id,tid)+'/decline','POST'),
    boardingPin: (id,tid) => call(ticket(id,tid)+'/boarding-challenge','POST'),
    board: (id,tid,pin) => call(ticket(id,tid)+'/board','POST',{pin}),
    complete: (id,tid) => call(ticket(id,tid)+'/complete','POST'),
    safetyReports: signal => call('/v1/me/safety-reports','GET',null,{signal}),
    submitSafetyReport: data => call('/v1/safety-reports','POST',data),
    recurringRides: signal => call('/v1/recurring-rides','GET',null,{signal}),
    saveRecurring: data => call('/v1/recurring-rides','POST',data),
    materializeRecurring: id => call('/v1/recurring-rides/'+encodeURIComponent(id)+'/materialize','POST'),
    skipRecurring: (id,date,reason) => call('/v1/recurring-rides/'+encodeURIComponent(id)+'/exceptions/'+encodeURIComponent(date),'PUT',{reason}),
    circles: signal => call('/v1/circles','GET',null,{signal}),
    circle: (id,signal) => call('/v1/circles/'+encodeURIComponent(id),'GET',null,{signal}),
    circleJourneys: (id,signal) => call('/v1/circles/'+encodeURIComponent(id)+'/journeys','GET',null,{signal}),
    createCircle: name => call('/v1/circles','POST',{name}),
    inviteCircle: id => call('/v1/circles/'+encodeURIComponent(id)+'/invitations','POST'),
    joinCircle: token => call('/v1/circle-invitations/redeem','POST',{token}),
    alerts: signal => call('/v1/me/notifications','GET',null,{signal}),
    saveAlerts: data => call('/v1/me/notifications','PUT',data),
    connectAlertEmail: () => call('/v1/me/notifications/email','POST'),
    requestPhoneCode: data => call('/v1/me/notifications/phone/code','POST',data),
    verifyPhone: data => call('/v1/me/notifications/phone/verify','POST',data),
    ticketAlerts: (id,tid,signal) => call(ticket(id,tid)+'/notifications','GET',null,{signal}),
    contacts: signal => call('/v1/me/trusted-contacts', 'GET', null, {signal}),
    saveContact: (slot, data) => call('/v1/me/trusted-contacts/' + slot, 'PUT', data),
    deleteContact: slot => call('/v1/me/trusted-contacts/' + slot, 'DELETE'),
    startShare: data => call('/v1/trip-shares', 'POST', data),
    locateShare: (id, data) => call('/v1/trip-shares/' + id + '/location', 'PUT', data),
    stopShare: (id, keepalive=false) => call('/v1/trip-shares/' + id + '/stop', 'POST', null, {keepalive}),
    driverLocation: (id,tid,signal) => call(ticket(id,tid)+'/driver-location','GET',null,{signal}),
    viewShare: (token, signal) => call('/v1/trip-shares/view', 'POST', {token}, {signal}),
    commute: signal => call('/v1/me/commute', 'GET', null, {signal}),
    saveCommute: data => call('/v1/me/commute', 'PUT', data),
    forgetCommute: () => call('/v1/me/commute', 'DELETE'),
    conversations: (query={},signal) => call('/v1/me/conversations?'+new URLSearchParams(query),'GET',null,{signal}),
    messages: (id, tid, signal) => call(ticket(id, tid) + '/messages', 'GET', null, {signal}),
    readMessages: (id, tid, message_id, signal) => call(ticket(id,tid)+'/messages/read','POST',{message_id},{signal}),
    sendMessage: (id, tid, data) => call(ticket(id, tid) + '/messages', 'POST', data),
    blockChat: (id, tid) => call(ticket(id, tid) + '/messages/block', 'POST'),
    search: (q, signal, onStatus) => recoverSearch(() => call('/v1/journeys/search', 'POST', q, {
      signal
    }), signal, onStatus),
    detail: (id, signal) => call(path(id), 'GET', null, {
      signal
    }),
    mine: (offset = 0, signal) => call('/v1/journeys/mine?offset=' + offset, 'GET', null, {
      signal
    }),
    allMine: signal => pages('/v1/journeys/mine', signal),
    publish: data => call('/v1/journeys', 'POST', data),
    quote: (id, board, alight) => call(path(id) + '/quote', 'POST', {
      board,
      alight
    }),
    hold: (id, board, alight, key) => call(path(id) + '/holds', 'POST', {
      board,
      alight,
      checkout_id: key
    }),
    pay: (id, tid) => call(ticket(id, tid) + '/sandbox-pay', 'POST'),
    cancelTicket: (id, tid, max_fee_paise) => call(ticket(id, tid) + '/cancel', 'POST', {
      max_fee_paise
    }),
    cancelRide: id => call(path(id) + '/cancel', 'POST'),
    exit: (id, tid, stop) => call(ticket(id, tid) + '/exit', 'POST', {
      stop
    }),
    rate: (id, tid, stars) => call(ticket(id, tid) + '/rating', 'PUT', {
      stars
    }),
    unpriced: signal => pages('/v1/rides/mine?limit=50', signal),
    earlierBookings: signal => pages('/v1/bookings/mine?limit=50', signal),
    earlierTrips: (role,history,signal) => pages('/v1/me/earlier-trips?'+new URLSearchParams({role,history}),signal),
    earlierDecision: (id,action) => call('/v1/bookings/'+encodeURIComponent(id)+'/'+action,'POST'),
    oldDetail: id => call('/v1/rides/' + id + '/details'),
    oldCancel: id => call('/v1/rides/' + id + '/cancel', 'POST'),
    ask: question => call('/v1/help/ask', 'POST', {
      question
    }, {
      timeout: 145000
    }),
    translate: (landmark, language) => call('/v1/meeting-notes/translate', 'POST', {
      landmark,
      language
    })
  };
}
