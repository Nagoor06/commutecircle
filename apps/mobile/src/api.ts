import { API } from './types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
  timeout?: number;
};
export async function jsonRequest<T>(
  url: string,
  { method = 'GET', body, signal, timeout = 25000 }: Options = {},
  token?: string,
): Promise<T> {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel);
  const timer = setTimeout(cancel, timeout);
  try {
    const response = await fetch(url, {
      method,
      signal: abort.signal,
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))).detail;
      const reason =
        typeof detail === 'string'
          ? detail
          : Array.isArray(detail)
            ? detail
                .map((d) => d.msg)
                .slice(0, 2)
                .join(' · ')
            : '';
      throw new HttpError(
        response.status,
        reason || 'Request failed (' + response.status + '). Please try again.',
      );
    }
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof HttpError || signal?.aborted) throw error;
    throw new Error(
      abort.signal.aborted
        ? 'The service took too long. Try again.'
        : 'Could not reach the service. Check your connection and try again.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
export type Client = <T>(path: string, options?: Options) => Promise<T>;
export function createClient(
  token: () => Promise<string | null>,
  onUnauthorized: (used: string) => Promise<void>,
): Client {
  return async function request<T>(path: string, options?: Options) {
    if (!path.startsWith('/v1/') || path.includes('://')) throw new Error('Invalid API path.');
    const used = await token();
    try {
      return await jsonRequest<T>(API + path, options, used || undefined);
    } catch (error) {
      if (error instanceof HttpError && error.status === 401 && used) await onUnauthorized(used);
      throw error;
    }
  };
}
