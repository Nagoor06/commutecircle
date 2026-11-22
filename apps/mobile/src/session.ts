import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { API, WEB } from './types';
import { HttpError, jsonRequest } from './api';

export const variant = Constants.expoConfig?.extra?.preview === true ? 'preview' : 'app';
const scheme = 'io.github.nagoor06.commutecircle' + (variant === 'preview' ? '.preview' : '');
export const callback = scheme + '://oauth/callback';
const issuer = 'https://dev-k7el8butwnjlle3n.us.auth0.com/';
const audience = 'https://commutecircle-api';
const sessionKey = 'commutecircle.session.v1',
  pendingKey = 'commutecircle.login.v1';
const scope = 'openid offline_access rides:read rides:write';
type Tokens = { access: string; refresh?: string; until: number; client: string };
type Grant = { access_token: string; token_type: string; expires_in: number; refresh_token?: string };
type Pending = { state: string; verifier: string; client: string; started: number };
type Status = {
  ready: boolean;
  signed: boolean;
  busy: boolean;
  message: string;
  accountGeneration: number;
};
const nonce = () => Crypto.randomUUID().replace(/-/g, '');
function tokens(grant: Grant, client: string, previous?: string): Tokens {
  if (grant.token_type?.toLowerCase() !== 'bearer' || !grant.access_token || !(grant.expires_in > 0))
    throw Error('Sign-in did not return a usable session.');
  return {
    access: grant.access_token,
    refresh: grant.refresh_token || previous,
    until: Date.now() + grant.expires_in * 1000,
    client,
  };
}
export class NativeSession {
  private data: Tokens | null = null;
  private status: Status = {
    ready: false,
    signed: false,
    busy: false,
    message: '',
    accountGeneration: 0,
  };
  private listeners = new Set<() => void>();
  private epoch = 0;
  private restoring?: Promise<void>;
  private renewing?: Promise<string | null>;
  private processing = new Set<string>();
  private storage: Promise<void> = Promise.resolve();
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  snapshot = () => this.status;
  private publish(update: Partial<Status>) {
    this.status = { ...this.status, ...update };
    this.listeners.forEach((fn) => fn());
  }
  private write(task: () => Promise<void>) {
    const next = this.storage.then(task);
    this.storage = next.catch(() => {});
    return next;
  }
  load = () =>
    (this.restoring ??= (async () => {
      const epoch = this.epoch;
      try {
        const raw = await SecureStore.getItemAsync(sessionKey);
        if (epoch !== this.epoch) {
          this.publish({ ready: true });
          return;
        }
        if (raw) {
          const saved: Tokens = JSON.parse(raw);
          if (saved?.access && saved.client && (saved.until > Date.now() || saved.refresh))
            this.data = saved;
          else await this.write(() => SecureStore.deleteItemAsync(sessionKey));
        }
        this.publish({ ready: true, signed: !!this.data });
      } catch {
        this.publish({
          ready: true,
          message: 'Could not restore this device’s session. Sign in again.',
        });
      }
    })());
  private async keep(value: Tokens, epoch: number) {
    if (this.epoch !== epoch) return false;
    await this.write(() => SecureStore.setItemAsync(sessionKey, JSON.stringify(value)));
    if (this.epoch !== epoch) return false;
    this.data = value;
    this.publish({ signed: true, message: '' });
    return true;
  }
  signOut = async (message = '') => {
    ++this.epoch;
    this.data = null;
    this.renewing = undefined;
    this.publish({
      signed: false,
      busy: false,
      message,
      accountGeneration: this.status.accountGeneration + 1,
    });
    await this.write(async () => {
      await SecureStore.deleteItemAsync(sessionKey);
      await SecureStore.deleteItemAsync(pendingKey);
    });
  };
  reject = async (used: string) => {
    if (this.data?.access === used) await this.signOut('Your session ended. Sign in again.');
  };
  token = async (): Promise<string | null> => {
    await this.load();
    const current = this.data;
    if (!current) return null;
    if (current.until > Date.now() + 15000) return current.access;
    if (!current.refresh) {
      await this.signOut('Your session ended. Sign in again.');
      throw Error('Sign in to continue.');
    }
    if (this.renewing) return this.renewing;
    const epoch = this.epoch;
    const refresh = (async () => {
      try {
        const grant = await jsonRequest<Grant>(issuer + 'oauth/token', {
          method: 'POST',
          body: {
            grant_type: 'refresh_token',
            client_id: current.client,
            refresh_token: current.refresh,
          },
        });
        const next = tokens(grant, current.client, current.refresh);
        if (!(await this.keep(next, epoch))) throw Error('Your account changed.');
        return next.access;
      } catch (e) {
        if (this.epoch === epoch && e instanceof HttpError && [400, 401, 403].includes(e.status))
          await this.signOut('Your session ended. Sign in again.');
        throw e;
      }
    })();
    this.renewing = refresh;
    try {
      return await refresh;
    } finally {
      if (this.renewing === refresh) this.renewing = undefined;
    }
  };
  accept = async (url: string) => {
    if (!url.startsWith(callback + '?')) return;
    const state = new URL(url).searchParams.get('state');
    if (!state || this.processing.has(state)) return;
    this.processing.add(state);
    const epoch = this.epoch;
    try {
      await this.load();
      const raw = await SecureStore.getItemAsync(pendingKey);
      if (!raw || epoch !== this.epoch) return;
      const pending: Pending = JSON.parse(raw);
      if (state !== pending.state) return;
      await this.write(() => SecureStore.deleteItemAsync(pendingKey));
      const params = new URL(url).searchParams;
      if (Date.now() - pending.started > 600000 || Date.now() < pending.started)
        throw Error('Sign-in expired. Start again.');
      const code = params.get('code');
      if (params.has('error') || !code) throw Error('Sign-in was cancelled or declined.');
      const grant = await jsonRequest<Grant>(issuer + 'oauth/token', {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          client_id: pending.client,
          redirect_uri: WEB,
          code_verifier: pending.verifier,
          code,
        },
      });
      if (await this.keep(tokens(grant, pending.client), epoch))
        this.publish({ accountGeneration: this.status.accountGeneration + 1 });
    } catch (e) {
      if (epoch === this.epoch)
        this.publish({ message: e instanceof Error ? e.message : 'Could not finish sign-in.' });
    } finally {
      this.processing.delete(state);
    }
  };
  signIn = async () => {
    if (this.status.busy) return;
    await this.load();
    if (this.status.busy) return;
    const epoch = this.epoch;
    this.publish({ busy: true, message: '' });
    try {
      const config = await jsonRequest<{ issuer: string; client_id: string; audience: string }>(
        API + '/v1/studio-config',
        { timeout: 75000 },
      );
      if (config.issuer !== issuer || config.audience !== audience || !config.client_id)
        throw Error('Sign-in configuration is unavailable.');
      const verifier = nonce() + nonce();
      const challenge = (
        await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
          encoding: Crypto.CryptoEncoding.BASE64,
        })
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
      const state = 'ccnative.v1.' + variant + '.' + nonce();
      if (epoch !== this.epoch) return;
      await this.write(() =>
        SecureStore.setItemAsync(
          pendingKey,
          JSON.stringify({ state, verifier, client: config.client_id, started: Date.now() }),
        ),
      );
      if (epoch !== this.epoch) return;
      const query = new URLSearchParams({
        client_id: config.client_id,
        audience,
        response_type: 'code',
        scope,
        redirect_uri: WEB,
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        prompt: 'login',
      });
      const result = await WebBrowser.openAuthSessionAsync(
        issuer + 'authorize?' + query.toString(),
        callback,
      );
      if (result.type === 'success') await this.accept(result.url);
    } catch (e) {
      if (epoch === this.epoch)
        this.publish({ message: e instanceof Error ? e.message : 'Could not start sign-in.' });
    } finally {
      if (epoch === this.epoch) this.publish({ busy: false });
    }
  };
}
export const session = new NativeSession();
