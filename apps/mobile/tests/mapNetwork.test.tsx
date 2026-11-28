import { act } from 'react';
import { create, type ReactTestRenderer } from 'react-test-renderer';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useMapNetwork } from '../src/useMapNetwork';

jest.mock('expo-network', () => ({ addNetworkStateListener: jest.fn(), getNetworkStateAsync: jest.fn() }));

test('a stale initial read cannot undo reconnection or trigger duplicate retries', async () => {
  let emit!: (network: NetworkState) => void, initial!: (network: NetworkState) => void;
  const remove = jest.fn();
  jest.mocked(addNetworkStateListener).mockImplementation((listener) => { emit = listener; return { remove }; });
  jest.mocked(getNetworkStateAsync).mockImplementation(() => new Promise((resolve) => { initial = resolve; }));
  let state!: ReturnType<typeof useMapNetwork>, tree!: ReactTestRenderer;
  function Probe() { state = useMapNetwork(); return null; }
  await act(async () => { tree = create(<Probe />); });
  await act(async () => emit({ isConnected: false, isInternetReachable: false }));
  await act(async () => emit({ isConnected: true, isInternetReachable: true }));
  await act(async () => { initial({ isConnected: false }); emit({ isConnected: true, isInternetReachable: true }); });
  expect(state).toMatchObject({ online: true, restored: 1 });
  await act(async () => tree.unmount());
  expect(remove).toHaveBeenCalledTimes(1);
});
