import * as SecureStore from 'expo-secure-store';
import * as Browser from 'expo-web-browser';
import { NativeSession, callback } from '../src/session';
import { API, WEB } from '../src/types';
import { createClient } from '../src/api';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));
jest.mock('expo-web-browser', () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('node:crypto').randomUUID(),
  CryptoDigestAlgorithm: { SHA256: 'SHA256' },
  CryptoEncoding: { BASE64: 'base64' },
  digestStringAsync: async (_algorithm: string, value: string) =>
    require('node:crypto').createHash('sha256').update(value).digest('base64'),
}));
const memory = new Map<string, string>();
const key = 'commutecircle.session.v1',
  pending = 'commutecircle.login.v1';
const grant = {
  access_token: 'new-access',
  refresh_token: 'new-refresh',
  expires_in: 3600,
  token_type: 'Bearer',
};
const config = {
  issuer: 'https://dev-k7el8butwnjlle3n.us.auth0.com/',
  audience: 'https://commutecircle-api',
  client_id: 'fixture',
};
const reply = (value: unknown, status = 200) =>
  ({ status, ok: status >= 200 && status < 300, json: async () => value }) as Response;
const save = (until: number) =>
  memory.set(key, JSON.stringify({ access: 'current', refresh: 'refresh', until, client: 'fixture' }));
const network = jest.fn();
beforeEach(() => {
  jest.clearAllMocks();
  memory.clear();
  network.mockReset();
  globalThis.fetch = network;
  jest.mocked(SecureStore.getItemAsync).mockImplementation(async (k) => memory.get(k) ?? null);
  jest.mocked(SecureStore.setItemAsync).mockImplementation(async (k, v) => {
    memory.set(k, v);
  });
  jest.mocked(SecureStore.deleteItemAsync).mockImplementation(async (k) => {
    memory.delete(k);
  });
});
test('sign in uses S256, sends the code once, survives restart, and clears on sign out', async () => {
  const session = new NativeSession();
  network.mockImplementation(async (url: string, options: RequestInit) => {
    if (url === API + '/v1/studio-config') return reply(config);
    const body = JSON.parse(String(options.body));
    expect(url).toBe(config.issuer + 'oauth/token');
    expect(body.redirect_uri).toBe(WEB);
    expect(body.code_verifier).toHaveLength(64);
    expect(body.code).toBe('sample');
    return reply(grant);
  });
  jest.mocked(Browser.openAuthSessionAsync).mockImplementation(async (url) => {
    const params = new URL(url!).searchParams,
      state = params.get('state')!;
    expect(params.get('code_challenge_method')).toBe('S256');
    expect(params.get('code_challenge')).toHaveLength(43);
    expect(params.get('redirect_uri')).toBe(WEB);
    await session.accept(callback + '?code=sample&state=wrong');
    expect(memory.has(pending)).toBe(true);
    await Promise.all([1, 2].map(() => session.accept(callback + '?code=sample&state=' + state)));
    return { type: 'success', url: callback + '?code=sample&state=' + state };
  });
  await session.signIn();
  expect(session.snapshot().signed).toBe(true);
  expect(network).toHaveBeenCalledTimes(2);
  expect(memory.has(pending)).toBe(false);
  const restart = new NativeSession();
  expect(await restart.token()).toBe(grant.access_token);
  await restart.signOut();
  expect(await new NativeSession().token()).toBeNull();
});
test('refresh retries after an outage and shares a single successful rotation', async () => {
  save(0);
  const s = new NativeSession();
  network.mockRejectedValueOnce(Error('network down'));
  await expect(s.token()).rejects.toThrow(/connection/);
  expect(s.snapshot().signed).toBe(true);
  expect(memory.has(key)).toBe(true);
  network.mockResolvedValue(reply(grant));
  expect(await Promise.all([s.token(), s.token()])).toEqual(['new-access', 'new-access']);
  expect(network).toHaveBeenCalledTimes(2);
  await s.reject('current');
  expect(s.snapshot().signed).toBe(true);
});
test('revoked refresh clears persisted credentials', async () => {
  save(0);
  network.mockResolvedValue(reply({ error: 'invalid_grant' }, 400));
  const s = new NativeSession();
  await expect(s.token()).rejects.toThrow();
  expect(s.snapshot().signed).toBe(false);
  expect(memory.has(key)).toBe(false);
});
test('sign out during refresh prevents a late result from restoring the account', async () => {
  save(0);
  const s = new NativeSession();
  await s.load();
  let deliver!: (value: Response) => void;
  network.mockImplementation(
    () =>
      new Promise((resolve) => {
        deliver = resolve;
      }),
  );
  const refresh = s.token();
  await Promise.resolve();
  await s.signOut();
  deliver(reply(grant));
  await expect(refresh).rejects.toThrow(/changed/);
  expect(memory.has(key)).toBe(false);
});
test('an unauthorized write is never replayed and a success with no body works', async () => {
  const expired = jest.fn(async () => {}),
    api = createClient(async () => 'stale', expired);
  network.mockResolvedValueOnce(reply({}, 401)).mockResolvedValueOnce(reply(null, 204));
  await expect(api('/v1/circles', { method: 'POST', body: { name: 'Test' } })).rejects.toThrow();
  expect(expired).toHaveBeenCalledWith('stale');
  expect(network).toHaveBeenCalledTimes(1);
  await expect(api('/v1/circles/example/members/me', { method: 'DELETE' })).resolves.toBeUndefined();
});
