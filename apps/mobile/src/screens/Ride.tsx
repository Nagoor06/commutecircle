import React, { useCallback, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { WebLink } from './Account';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { Traveller, TravellerPicker } from '../TravellerPicker';
import { Button, Card, Feedback, Field, Heading, LoadState, s } from '../ui';
import { Journey, Quote, Ticket, money, ticketPath, when } from '../types';

function Reservation({
  journey,
  ticket,
  refresh,
}: {
  journey: Journey;
  ticket: Ticket;
  refresh: () => void;
}) {
  const { api, open } = useMobile();
  const action = useAction();
  const [pin, setPin] = useState('');
  const [challenge, setChallenge] = useState<{ pin: string; expires_at: string }>();
  const path = ticketPath(journey.id, ticket.id);
  const owner = journey.owner,
    now = Date.now();
  const pickup = Date.parse(journey.departure) + journey.stops[ticket.board].minutes * 60000;
  const end = Date.parse(journey.departure) + journey.stops[ticket.alight].minutes * 60000;
  const expired = ['held', 'requested'].includes(ticket.state) && Date.parse(ticket.expires) <= now;
  const state = expired ? 'expired' : ticket.state;
  function change(operation: string, body?: unknown) {
    void action.run(async () => {
      await api(path + '/' + operation, { method: 'POST', body });
      setPin('');
      refresh();
    });
  }
  function cancel() {
    void action.run(async () => {
      const quote = await api<Quote>('/v1/journeys/' + journey.id + '/quote', {
        method: 'POST',
        body: { board: ticket.board, alight: ticket.alight },
      });
      const fee = owner || ticket.charged_paise === 0 ? 0 : quote.passenger_fee_if_cancelled_now_paise;
      Alert.alert('Cancel this reservation?', 'Sandbox cancellation fee ' + money(fee) + '.', [
        { text: 'Keep reservation', style: 'cancel' },
        {
          text: 'Cancel reservation',
          style: 'destructive',
          onPress: () => change('cancel', { max_fee_paise: fee }),
        },
      ]);
    });
  }
  return (
    <Card>
      <Text style={s.heading}>
        {journey.stops[ticket.board].name} → {journey.stops[ticket.alight].name}
      </Text>
      <Text style={s.body}>
        Reservation · {state.replace(/_/g, ' ')}
        {ticket.travel_state === 'boarded' ? ' · boarded' : ''}
      </Text>
      {ticket.guest_name && (
        <Text style={s.body}>{owner ? 'Travelling guest' : 'Booked for'} · {ticket.guest_name}</Text>
      )}
      <Text style={s.muted}>
        Fare {money(ticket.fare_paise)} · Paid {money(ticket.charged_paise)} · Refunded{' '}
        {money(ticket.refund_paise)}
      </Text>
      {state === 'held' && !owner && (
        <>
          <Text style={s.muted}>Held until {when(ticket.expires)}</Text>
          <Button
            title={'Confirm sandbox payment ' + money(ticket.fare_paise)}
            disabled={action.busy}
            onPress={() => change('sandbox-pay')}
          />
        </>
      )}
      {state === 'requested' &&
        (owner ? (
          <View style={s.row}>
            <Button title="Approve" disabled={action.busy} onPress={() => change('approve')} />
            <Button secondary title="Decline" disabled={action.busy} onPress={() => change('decline')} />
          </View>
        ) : (
          <Text style={s.muted}>Waiting for driver approval.</Text>
        ))}
      {!journey.cancelled &&
        now < pickup &&
        ['requested', 'held', 'paid'].includes(state) &&
        ticket.travel_state !== 'boarded' && (
          <Button secondary title="Cancel reservation" disabled={action.busy} onPress={cancel} />
        )}
      {ticket.confirmed && (
        <Button
          secondary
          title={owner && ticket.guest_name ? 'Message the booker' : 'Open booking chat'}
          onPress={() => open({ screen: 'chat', journey: journey.id, ticket: ticket.id })}
        />
      )}
      {state === 'paid' &&
        ticket.travel_state === 'awaiting_boarding' &&
        now >= pickup - 1800000 &&
        now <= pickup + 2700000 &&
        (owner ? (
          <>
            <Field
              label="Passenger boarding PIN"
              value={pin}
              keyboardType="number-pad"
              maxLength={6}
              onChangeText={setPin}
            />
            <Button
              title="Confirm boarding"
              disabled={action.busy || !/^\d{6}$/.test(pin)}
              onPress={() => change('board', { pin })}
            />
          </>
        ) : (
          <Button
            title="Show boarding PIN"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                setChallenge(await api(path + '/boarding-challenge', { method: 'POST' }));
              })
            }
          />
        ))}
      {challenge &&
        state === 'paid' &&
        ticket.travel_state === 'awaiting_boarding' &&
        Date.parse(challenge.expires_at) > now && (
          <Text style={s.body}>
            {ticket.guest_name ? 'Send this PIN privately to ' + ticket.guest_name : 'Show your driver'} · {challenge.pin}. Expires {when(challenge.expires_at)}.
          </Text>
        )}
      {!owner &&
        ticket.travel_state === 'boarded' &&
        (state === 'exited' || (state === 'paid' && now >= end)) && (
          <Button
            title="Confirm trip complete"
            disabled={action.busy}
            onPress={() => change('complete')}
          />
        )}
      {state === 'paid' && (owner || !ticket.guest_name) && (
        <WebLink
          title="Trip sharing and tracking on the website"
          route={owner ? 'trips' : 'checkout/' + journey.id + '/' + ticket.id}
        />
      )}
      <Button
        secondary
        title="Report a safety concern"
        onPress={() => open({ screen: 'safety', journey: journey.id, ticket: ticket.id })}
      />
      <Feedback message={action.error} />
    </Card>
  );
}
export function Ride({ id, board, alight }: { id: string; board: number; alight: number }) {
  const { api, signed, login, signingIn } = useMobile();
  const path = '/v1/journeys/' + encodeURIComponent(id);
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [journey, quote] = await Promise.all([
        api<Journey>(path, { signal }),
        api<Quote>(path + '/quote', { method: 'POST', body: { board, alight }, signal }),
      ]);
      return { journey, quote };
    },
    [api, path, board, alight],
  );
  const result = useResource(load, 12000);
  const action = useAction();
  const request = useRef({ traveller: '', id: '' });
  const [traveller, setTraveller] = useState<Traveller>({ kind: 'self' });
  const [consent, setConsent] = useState(false);
  const [receipt, setReceipt] = useState('');
  const j = result.data?.journey,
    q = result.data?.quote;
  const forGuest = traveller.kind === 'guest';
  const name = forGuest ? traveller.name.normalize('NFC').trim().replace(/\s+/g, ' ') : null;
  const permission = forGuest && traveller.permission;
  const hasReservation = j?.tickets.some(
    (t) => t.board === board && t.alight === alight
      && (t.guest_name?.toLowerCase() ?? null) === (name?.toLowerCase() ?? null)
      && (t.state === 'paid' || (['requested', 'held'].includes(t.state) && Date.parse(t.expires) > Date.now())),
  );
  const book = () =>
    void action.run(async () => {
      if (!j || !q) return;
      const approval = j.booking_mode === 'approval';
      if (approval && !consent) throw Error('Accept the pickup and fare to request this seat.');
      if (forGuest && (!j.guest_booking_available || !name || !permission)) {
        throw Error('Enter the traveller’s name and confirm their permission.');
      }
      const key = JSON.stringify([id, board, alight, name?.toLowerCase() ?? null]);
      if (request.current.traveller !== key) {
        request.current = { traveller: key, id: Crypto.randomUUID() };
      }
      const booking = await api<{ id: string; state: string }>(
        path + (approval ? '/requests' : '/holds'),
        {
          method: 'POST',
          body: {
            board, alight,
            ...(approval
              ? { request_id: request.current.id, consent: true, consent_version: 'cc-v2-1' }
              : { checkout_id: request.current.id }),
            ...(forGuest ? { guest: { name, permission } } : {}),
          },
        },
      );
      request.current = { traveller: '', id: '' };
      result.refresh();
      if (!['requested', 'held', 'paid'].includes(booking.state)) {
        throw Error('The earlier reservation closed. Check availability and try again.');
      }
      setReceipt(
        booking.state === 'requested'
          ? 'Request sent to the driver.'
          : 'Reservation saved. Review its status below.',
      );
      setConsent(false);
    });
  return (
    <View style={s.screen}>
      <Heading>Ride details</Heading>
      <LoadState {...result} />
      {j && q && (
        <>
          <Card>
            <Text style={s.heading}>
              {j.stops[board].name} → {j.stops[alight].name}
            </Text>
            <Text style={s.body}>
              {when(q.pickup_at)} · {money(q.fare_paise)} per seat
            </Text>
            <Text style={s.muted}>
              {j.driver_name || 'Driver'} ·{' '}
              {j.driver_verified ? 'Verified driver' : 'Verification unconfirmed'}
            </Text>
            {j.vehicle && (
              <Text style={s.muted}>
                {j.vehicle.color} {j.vehicle.make} {j.vehicle.model} ·{' '}
                {j.vehicle_verified ? 'Verified vehicle' : 'Vehicle verification unconfirmed'}
              </Text>
            )}
            <Text style={s.muted}>
              {j.cancelled ? 'Ride cancelled' : q.seats_available + ' seats available'} · Sandbox fares
            </Text>
          </Card>
          {!j.owner &&
            (!hasReservation || j.guest_booking_available) &&
            j.booking_eligible &&
            !j.cancelled &&
            q.seats_available > 0 && (
              <Card>
                {signed ? (
                  <>
                    {j.guest_booking_available && (
                      <TravellerPicker value={traveller} disabled={action.busy} onChange={(next) => {
                        setTraveller(next);
                        setConsent(false);
                        setReceipt('');
                      }} />
                    )}
                    {!hasReservation && j.booking_mode === 'approval' && (
                      <Button
                        secondary
                        title={consent ? '✓ Pickup and fare accepted' : 'Accept pickup time and fare'}
                        disabled={action.busy}
                        onPress={() => setConsent(!consent)}
                      />
                    )}
                    {hasReservation ? (
                      <Text style={s.muted}>See the existing reservation below.</Text>
                    ) : (
                      <Button
                        title={j.booking_mode === 'approval' ? 'Request driver approval' : 'Hold a seat'}
                        disabled={action.busy || (forGuest && (!permission || !name)) || (j.booking_mode === 'approval' && !consent)}
                        onPress={book}
                      />
                    )}
                  </>
                ) : (
                  <Button title="Sign in to book" disabled={signingIn} onPress={login} />
                )}
              </Card>
            )}
          {receipt ? (
            <Text accessibilityLiveRegion="polite" style={s.body}>
              {receipt}
            </Text>
          ) : null}
          {j.tickets.map((t) => (
            <Reservation key={t.id} journey={j} ticket={t} refresh={result.refresh} />
          ))}
          {j.owner && !j.cancelled && Date.parse(j.departure) > Date.now() && (
            <Button
              secondary
              title="Cancel ride"
              onPress={() =>
                Alert.alert(
                  'Cancel the whole ride?',
                  'Passengers will receive their applicable sandbox refunds.',
                  [
                    { text: 'Keep ride', style: 'cancel' },
                    {
                      text: 'Cancel ride',
                      style: 'destructive',
                      onPress: () =>
                        void action.run(async () => {
                          await api(path + '/cancel', { method: 'POST' });
                          result.refresh();
                        }),
                    },
                  ],
                )
              }
            />
          )}
        </>
      )}
      <Feedback message={action.error} />
    </View>
  );
}
export function Trips() {
  const { api } = useMobile();
  const [page, setPage] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) => api<Journey[]>('/v1/journeys/mine?offset=' + page * 50, { signal }),
    [api, page],
  );
  const result = useResource(load);
  const { open } = useMobile();
  return (
    <View style={s.screen}>
      <Heading>My trips</Heading>
      <WebLink route="recurring" title="Manage recurring rides on the website" />
      <LoadState {...result} />
      {!result.loading && !result.error && !result.data?.length && (
        <Text style={s.body}>Your offers and reservations will appear here.</Text>
      )}
      {result.data?.map((j) => (
        <Card key={j.id}>
          <Text style={s.heading}>
            {j.stops[0].name} → {j.stops[j.stops.length - 1].name}
          </Text>
          <Text style={s.muted}>
            {when(j.departure)} · {j.cancelled ? 'Cancelled' : j.owner ? 'Your offer' : 'Your reservations'}
          </Text>
          {!j.owner && j.tickets.some((t) => t.guest_name) && (
            <Text style={s.body}>Booked for {Array.from(new Set(j.tickets.map((t) => t.guest_name).filter(Boolean))).join(', ')}</Text>
          )}
          <Button
            secondary
            title="View trip and receipts"
            onPress={() =>
              open({
                screen: 'ride',
                id: j.id,
                board: j.owner ? 0 : (j.tickets[0]?.board ?? 0),
                alight: j.owner ? j.stops.length - 1 : (j.tickets[0]?.alight ?? j.stops.length - 1),
              })
            }
          />
        </Card>
      ))}
      <View style={s.row}>
        {page > 0 && <Button secondary title="Newer trips" onPress={() => setPage((p) => p - 1)} />}
        {result.data?.length === 50 && (
          <Button secondary title="Older trips" onPress={() => setPage((p) => p + 1)} />
        )}
      </View>
    </View>
  );
}
