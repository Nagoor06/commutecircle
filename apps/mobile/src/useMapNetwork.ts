import { useEffect, useState } from 'react';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';

export function useMapNetwork() {
  const [connection, setConnection] = useState<{ online?: boolean; validated?: boolean; restored: number }>({ restored: 0 });
  useEffect(() => {
    let active = true, receivedEvent = false;
    const update = (state: NetworkState) => {
      // Some networks carry street tiles even when Android's Internet validation is delayed.
      const online = state.isConnected ?? state.isInternetReachable;
      const validated = state.isInternetReachable;
      if (!active || online === undefined) return;
      setConnection((last) => {
        if (last.online === online && last.validated === validated) return last;
        const recovered = online && (last.online === false || (last.validated === false && validated === true));
        return { online, validated, restored: last.restored + (recovered ? 1 : 0) };
      });
    };
    const listener = addNetworkStateListener((state) => { receivedEvent = true; update(state); });
    void getNetworkStateAsync().then((state) => { if (!receivedEvent) update(state); }).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, []);
  return connection;
}
