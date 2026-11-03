export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status
  }
}
export function liveClient(token, origin) {
  async function call(path, method = 'GET', data, options = {}) {
    let response;
    try {
      response = await fetch(origin + path, {
        method,
        credentials: 'same-origin',
        headers: {
          Authorization: 'Bearer ' + token,
          ...(data ? {
            'Content-Type': 'application/json'
          } : {})
        },
        body: data ? JSON.stringify(data) : undefined,
        signal: options.signal || AbortSignal.timeout(options.timeout || 18000)
      })
    } catch (e) {
      if (e.name === 'AbortError') throw e;
      throw new ApiError(0, 'The service could not be reached. Try again.')
    }
    if (!response.ok) {
      const body = await response.json().catch(() => ({})),
        detail = body.detail;
      const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail.map(v => v.msg)
        .slice(0, 2).join(' · ') : 'Request could not be completed.';
      throw new ApiError(response.status, response.status === 401 ?
        'Session ended. Sign in again to continue.' : message)
    }
    return response.json();
  }
  const path = id => '/v1/journeys/' + encodeURIComponent(id);
  const ticket = (id, tid) => path(id) + '/tickets/' + encodeURIComponent(tid);
  return {
    mode: 'live',
    search: (q, signal) => call('/v1/journeys/search', 'POST', q, {
      signal
    }),
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
