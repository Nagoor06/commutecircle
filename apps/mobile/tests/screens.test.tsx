import React, { act } from 'react';
import { AppState, PermissionsAndroid } from 'react-native';
import * as Location from 'expo-location';
import { Book } from '../src/screens/Book';
import { create, ReactTestRenderer } from 'react-test-renderer';
import { Mobile, AppContext } from '../src/context';
import { Client, Options } from '../src/api';
import { Button, Feedback, Field } from '../src/ui';
import { Unread } from '../src/Unread';
import { Ride } from '../src/screens/Ride';
import { Conversation } from '../src/screens/Inbox';
import { Verification } from '../src/screens/Verification';

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));
const future = (days: number) => new Date(Date.now() + days * 86400000).toISOString();
const ctx = {
  signed: true,
  ready: true,
  signingIn: false,
  login: jest.fn(),
  logout: jest.fn(),
  open: jest.fn(),
};
let tree: ReactTestRenderer;
const button = (title: string) => tree.root.findAllByType(Button).find((b) => b.props.title === title)!;
async function mount(
  screen: React.ReactElement,
  api: (path: string, opts?: Options) => Promise<unknown>,
) {
  const value: AppContext = { ...ctx, api: api as Client };
  await act(async () => {
    tree = create(<Mobile.Provider value={value}>{screen}</Mobile.Provider>);
  });
}
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
test('approval needs consent, retries use one ID, and a new receipt replaces the booking controls', async () => {
  const journey = {
    id: 'journey',
    stops: [
      { name: 'Library', minutes: 0 },
      { name: 'Station', minutes: 15 },
    ],
    departure: future(2),
    booking_mode: 'approval',
    booking_eligible: true,
    cancelled: false,
    owner: false,
    driver_verified: true,
    tickets: [] as object[],
  };
  const writes: Record<string, unknown>[] = [];
  const api = async (path: string, opts?: Options) => {
    if (path.endsWith('/quote')) return { pickup_at: future(2), fare_paise: 4000, seats_available: 1 };
    if (path.endsWith('/requests')) {
      writes.push(opts!.body as Record<string, unknown>);
      if (writes.length === 1) throw Error('Connection lost');
      const ticket = {
        id: 'ticket',
        board: 0,
        alight: 1,
        state: 'requested',
        expires: future(1),
        fare_paise: 4000,
        charged_paise: 0,
        refund_paise: 0,
      };
      journey.tickets = [ticket];
      return ticket;
    }
    expect(path).toBe('/v1/journeys/journey');
    return { ...journey };
  };
  await mount(<Ride id="journey" board={0} alight={1} />, api);
  expect(button('Request driver approval').props.disabled).toBe(true);
  await act(async () => button('Accept pickup time and fare').props.onPress());
  await act(async () => button('Request driver approval').props.onPress());
  expect(tree.root.findAllByType(Feedback).some((n) => n.props.message === 'Connection lost')).toBe(
    true,
  );
  await act(async () => button('Request driver approval').props.onPress());
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0]).toMatchObject({ board: 0, alight: 1, consent: true, consent_version: 'cc-v2-1' });
  expect(button('Request driver approval')).toBeUndefined();
  expect(button('Open booking chat')).toBeUndefined();
});
test('chat acknowledges only incoming messages and retains a failed draft for an idempotent retry', async () => {
  const sent: unknown[] = [],
    reads: unknown[] = [];
  const path = '/v1/journeys/j/tickets/t/messages';
  await mount(<Conversation journey="j" ticket="t" />, async (url, opts) => {
    if (url === path + '/read') {
      reads.push(opts?.body);
      return {};
    }
    expect(url).toBe(path);
    if (opts?.method === 'POST') {
      sent.push(opts.body);
      if (sent.length === 1) throw Error('Offline');
      return {};
    }
    return {
      closed: false,
      role: 'passenger',
      messages: [
        { id: 'other', sender: 'driver', text: 'Meet me outside', created_at: future(-1) },
        { id: 'mine', sender: 'passenger', text: 'On my way', created_at: future(0) },
      ],
    };
  });
  expect(reads).toEqual([{ message_id: 'other' }]);
  await act(async () => tree.root.findByType(Field).props.onChangeText('At the station'));
  await act(async () => button('Send message').props.onPress());
  expect(tree.root.findByType(Field).props.value).toBe('At the station');
  await act(async () => button('Send message').props.onPress());
  expect(sent[1]).toEqual(sent[0]);
  expect(tree.root.findByType(Field).props.value).toBe('');
});

test('a guest reservation needs permission and keeps the retry tied to the selected traveller', async () => {
  const writes: { checkout_id: string; guest: { name: string; permission: boolean } }[] = [];
  const journey = {
    id: 'j', owner: false, guest_booking_available: true, booking_eligible: true, booking_mode: 'instant',
    stops: [{name:'Museum',minutes:0},{name:'Station',minutes:10}], departure: future(1), tickets: [],
  };
  await mount(<Ride id="j" board={0} alight={1} />, async (url, opts) => {
    if (url.endsWith('/quote')) return { pickup_at: future(1), fare_paise: 1000, seats_available: 2 };
    if (url.endsWith('/holds')) {
      writes.push(opts!.body as typeof writes[number]);
      throw Error('Connection lost');
    }
    return journey;
  });
  const radio = (name: string) => tree.root.findAllByProps({accessibilityRole:'radio', accessibilityLabel:name})
    .find((control) => typeof control.props.onPress === 'function')!;
  const permission = () => tree.root.findAllByProps({accessibilityLabel:'Traveller gave permission'})
    .find((control) => typeof control.props.onValueChange === 'function')!;
  await act(async () => radio('Someone else').props.onPress());
  await act(async () => tree.root.findByType(Field).props.onChangeText('Ava'));
  expect(button('Hold a seat').props.disabled).toBe(true);
  await act(async () => permission().props.onValueChange(true));
  await act(async () => button('Hold a seat').props.onPress());
  await act(async () => button('Hold a seat').props.onPress());
  expect(writes[0]).toEqual(writes[1]);
  expect(writes[0].guest).toEqual({name:'Ava',permission:true});
  await act(async () => tree.root.findByType(Field).props.onChangeText('లక్ష్మి'));
  expect(button('Hold a seat').props.disabled).toBe(true);
  await act(async () => permission().props.onValueChange(true));
  await act(async () => button('Hold a seat').props.onPress());
  expect(writes[2].checkout_id).not.toEqual(writes[0].checkout_id);
  expect(writes[2].guest.name).toBe('లక్ష్మి');
});

test('polling chat lets a slow read receipt finish and retries after a failed receipt', async () => {
  let foreground: ((state: 'active') => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string, handler: typeof foreground,
  ) => {
    foreground = handler;
    return { remove: jest.fn() };
  }) as typeof AppState.addEventListener);
  const signals: AbortSignal[] = [];
  let finish: ((result: unknown) => void) | undefined;
  await mount(<Conversation journey="j" ticket="t" />, async (url, opts) => {
    if (url.endsWith('/read')) {
      signals.push(opts!.signal!);
      if (signals.length === 1) throw Error('Temporarily unavailable');
      return new Promise((resolve) => { finish = resolve; });
    }
    return {role:'passenger',closed:false,messages:[{id:'m',sender:'driver',text:'Hello',created_at:future(-1)}]};
  });
  await act(async () => foreground!('active'));
  await act(async () => foreground!('active'));
  expect(signals).toHaveLength(2);
  expect(signals[1].aborted).toBe(false);
  await act(async () => finish!({read:true}));
  await act(async () => foreground!('active'));
  expect(signals).toHaveLength(2);
});
test('a new incoming message outside chat opens its own conversation from the alert', async () => {
  let foreground: ((state: 'active') => void) | undefined;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((
    _event: string,
    handler: typeof foreground,
  ) => {
    foreground = handler;
    return { remove: jest.fn() };
  }) as typeof AppState.addEventListener);
  const event = { message_id: 'm', ticket_id: 't', journey_id: 'j', created_at: future(0) };
  let items: (typeof event)[] = [];
  const count = jest.fn();
  await mount(<Unread onCount={count} />, async () => ({ unread: items.length, items }));
  expect(button('Open chat')).toBeUndefined();
  items = [event];
  await act(async () => foreground!('active'));
  expect(count).toHaveBeenLastCalledWith(1);
  await act(async () => button('Open chat').props.onPress());
  expect(ctx.open).toHaveBeenCalledWith({ screen: 'chat', journey: 'j', ticket: 't' });
  expect(button('Open chat')).toBeUndefined();
});
test('driver verification requires an evidence reference and sends a review request', async () => {
  const request = jest.fn(async () => ({ status: 'pending' })),
    refresh = jest.fn();
  await mount(
    <Verification
      eligibility={{ driver_status: 'unverified', vehicles: [], can_offer: false }}
      refresh={refresh}
    />,
    request,
  );
  expect(button('Submit driver application').props.disabled).toBe(true);
  await act(async () => tree.root.findByType(Field).props.onChangeText('review-sample'));
  await act(async () => button('Submit driver application').props.onPress());
  expect(request).toHaveBeenCalledWith('/v1/me/driver-verification', {
    method: 'POST',
    body: { evidence_reference: 'review-sample' },
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('denied location keeps pickup editable and only asks for approximate access on request', async () => {
  const check = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const ask = jest
    .spyOn(PermissionsAndroid, 'request')
    .mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  await mount(<Book />, async () => ({}));
  const pickup = () => tree.root.findAllByType(Field).find((field) => field.props.label === 'Pickup')!;
  expect(pickup().props.value).toBe('');
  expect(check).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  expect(ask).not.toHaveBeenCalled();
  await act(async () => button('Use current location').props.onPress());
  expect(ask).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION);
  expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  await act(async () => pickup().props.onChangeText('Station'));
  expect(pickup().props.value).toBe('Station');
});
test('a late location fix cannot replace the pickup a rider typed', async () => {
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  let resolve!: (p: Location.LocationObject) => void;
  jest.mocked(Location.getLastKnownPositionAsync).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  await mount(<Book />, async () => ({}));
  const pickup = () => tree.root.findAllByType(Field).find((field) => field.props.label === 'Pickup')!;
  await act(async () => pickup().props.onChangeText('My bus station'));
  await act(async () =>
    resolve({ coords: { latitude: 12.9716, longitude: 77.5946 } } as Location.LocationObject),
  );
  expect(pickup().props.value).toBe('My bus station');
});
