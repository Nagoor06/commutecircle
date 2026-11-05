import {recoverSearch} from './search-recovery.js';

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status
  }
}
export function liveClient(token, origin) {
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
  const path = id => '/v1/journeys/' + encodeURIComponent(id);
  const ticket = (id, tid) => path(id) + '/tickets/' + encodeURIComponent(tid);
  return {
    mode: 'live',
    contacts: signal => call('/v1/me/trusted-contacts', 'GET', null, {signal}),
    saveContact: (slot, data) => call('/v1/me/trusted-contacts/' + slot, 'PUT', data),
    deleteContact: slot => call('/v1/me/trusted-contacts/' + slot, 'DELETE'),
    startShare: data => call('/v1/trip-shares', 'POST', data),
    locateShare: (id, data) => call('/v1/trip-shares/' + id + '/location', 'PUT', data),
    stopShare: (id, keepalive=false) => call('/v1/trip-shares/' + id + '/stop', 'POST', null, {keepalive}),
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
    unpriced: () => call('/v1/rides/mine'),
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
