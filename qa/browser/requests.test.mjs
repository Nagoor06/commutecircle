import test from 'node:test';
import assert from 'node:assert/strict';
import {liveClient} from '../../services/api/app/studio/app/data/live.js';

test('a ride search times out even when its screen supplies a cancellation signal', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  t.mock.method(globalThis, 'fetch', (_url, {signal}) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), {once: true});
  }));
  const client = liveClient('test', 'https://api.example');
  const view = new AbortController();
  const slow = assert.rejects(client.search({}, view.signal), /took too long/);
  t.mock.timers.tick(18000);
  await slow;
  assert.equal(view.signal.aborted, false);

  const stale = assert.rejects(client.search({}, view.signal), {name: 'AbortError'});
  view.abort();
  await stale;
});
