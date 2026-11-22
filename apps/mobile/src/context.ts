import { createContext, useContext } from 'react';
import type { Client } from './api';
import type { Route } from './types';

export type AppContext = {
  api: Client;
  signed: boolean;
  ready: boolean;
  signingIn: boolean;
  login: () => void;
  logout: () => void;
  open: (route: Route) => void;
};
export const Mobile = createContext<AppContext | null>(null);
export function useMobile() {
  const value = useContext(Mobile);
  if (!value) throw Error('Missing mobile context.');
  return value;
}
