import { useCallback, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { LocationField } from '../LocationField';
import { wirePlace } from '../places';
import { jsonRequest } from '../api';
import { Button, Card, Field, Feedback, Heading, LoadState, s } from '../ui';
import { Circle, Eligibility, Journey, Place, Point, when } from '../types';

export function Offer() {
  const { api, open } = useMobile();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [eligibility, circles] = await Promise.all([
        api<Eligibility>('/v1/me/driver-eligibility', { signal }),
        api<Circle[]>('/v1/circles', { signal }),
      ]);
      return { eligibility, circles };
    },
    [api],
  );
  const result = useResource(load),
    action = useAction();
  const [from, setFrom] = useState<Place>({ name: '' }),
    [to, setTo] = useState<Place>({ name: '' });
  const [km, setKm] = useState(''),
    [minutes, setMinutes] = useState(''),
    [fare, setFare] = useState(''),
    [seats, setSeats] = useState('1');
  const [date, setDate] = useState(() => new Date(Math.ceil((Date.now() + 3600000) / 60000) * 60000));
  const [selected, setSelected] = useState(''),
    [circle, setCircle] = useState('');
  const pending = useRef({ payload: '', id: '' }),
    routeRevision = useRef(0);
  const verified = result.data?.eligibility.vehicles.filter((v) => v.status === 'approved') ?? [];
  const vehicle = verified.find((v) => v.id === selected) ?? verified[0];
  const ready = result.data?.eligibility.can_offer && vehicle;
  function changeStop(p: Place, origin: boolean) {
    routeRevision.current++;
    (origin ? setFrom : setTo)(p);
    setKm('');
    setMinutes('');
  }
  function pick(mode: 'date' | 'time') {
    DateTimePickerAndroid.open({
      value: date,
      mode,
      ...(mode === 'date' ? { minimumDate: new Date() } : {}),
      onValueChange: (_, chosen) => {
        const next = new Date(date);
        if (mode === 'date') next.setFullYear(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
        else next.setHours(chosen.getHours(), chosen.getMinutes(), 0, 0);
        setDate(next);
      },
    });
  }
  async function route() {
    if (from.lat == null || to.lat == null)
      throw Error('Select mapped suggestions for both stops, or enter distance and time below.');
    const version = routeRevision.current;
    const line = [from, to].map((p) => p.lon!.toFixed(5) + ',' + p.lat!.toFixed(5)).join(';');
    const data = await jsonRequest<{ code: string; routes: { distance: number; duration: number }[] }>(
      'https://router.project-osrm.org/route/v1/driving/' + line + '?overview=false',
      { timeout: 12000 },
    );
    if (version !== routeRevision.current) return;
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r || !(r.distance > 0) || !(r.duration > 0))
      throw Error('Road estimate unavailable. You can enter the measured distance and time.');
    setKm((r.distance / 1000).toFixed(2));
    setMinutes(String(Math.max(1, Math.round(r.duration / 60))));
  }
  async function publish() {
    if (!ready) throw Error('An approved driver and vehicle are required.');
    if (
      !from.name.trim() ||
      !to.name.trim() ||
      JSON.stringify(wirePlace(from)) === JSON.stringify(wirePlace(to))
    )
      throw Error('Choose two distinct public stops.');
    const metres = Math.round(Number(km) * 1000),
      duration = Number(minutes),
      capacity = Number(seats),
      price = Math.round(Number(fare) * 100);
    if (
      !Number.isFinite(metres) ||
      metres <= 0 ||
      metres > 3000000 ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 2880
    )
      throw Error('Enter a valid distance and travel time.');
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > vehicle.seat_capacity)
      throw Error('Check the passenger capacity for this vehicle.');
    if (!Number.isFinite(price) || price < 100 || price > 10000000)
      throw Error('Enter a sandbox fare between ₹1 and ₹100,000.');
    if (date.getTime() <= Date.now()) throw Error('Choose a departure in the future.');
    const data = {
      stops: [
        { ...wirePlace(from), metres: 0, minutes: 0 },
        { ...wirePlace(to), metres, minutes: duration },
      ],
      departure: date.toISOString(),
      price_paise: price,
      capacity,
      booking_mode: 'approval',
      vehicle_id: vehicle.id,
      ...(circle ? { circle_id: circle } : {}),
    };
    const fingerprint = JSON.stringify(data);
    if (fingerprint !== pending.current.payload)
      pending.current = { payload: fingerprint, id: Crypto.randomUUID() };
    const j = await api<Journey>('/v1/journeys', {
      method: 'POST',
      body: { ...data, offer_id: pending.current.id },
    });
    open({ screen: 'ride', id: j.id, board: 0, alight: j.stops.length - 1 });
  }
  return (
    <View style={s.screen}>
      <Heading>Offer a ride</Heading>
      <LoadState {...result} />
      {result.data &&
        (!ready ? (
          <Card>
            <Text style={s.body}>
              Complete driver and vehicle verification before publishing a ride.
            </Text>
            <Button title="Open profile" onPress={() => open({ tab: 'Profile' })} />
          </Card>
        ) : (
          <>
            <Card>
              <LocationField label="Boarding stop" place={from} onChange={(p) => changeStop(p, true)} />
              <LocationField
                label="Last stop"
                place={to}
                onChange={(p) => changeStop(p, false)}
                bias={from.lat != null ? (from as Point) : undefined}
              />
              <Button
                secondary
                title="Calculate road estimate"
                disabled={action.busy}
                onPress={() => void action.run(route)}
              />
              <Field
                label="Road distance (km)"
                value={km}
                keyboardType="decimal-pad"
                onChangeText={setKm}
              />
              <Field
                label="Travel time (minutes)"
                value={minutes}
                keyboardType="number-pad"
                onChangeText={setMinutes}
              />
            </Card>
            <Card>
              <Text style={s.heading}>{when(date.toISOString())}</Text>
              <View style={s.row}>
                <Button secondary title="Choose date" onPress={() => pick('date')} />
                <Button secondary title="Choose time" onPress={() => pick('time')} />
              </View>
              <Text style={s.body}>
                Vehicle · {vehicle.make} {vehicle.model}
              </Text>
              {verified.length > 1 &&
                verified.map((v) => (
                  <Button
                    key={v.id}
                    secondary
                    title={(v.id === vehicle.id ? '✓ ' : '') + v.color + ' ' + v.model}
                    onPress={() => setSelected(v.id)}
                  />
                ))}
              <Field
                label="Passenger seats"
                value={seats}
                onChangeText={setSeats}
                keyboardType="number-pad"
              />
              <Field
                label="Sandbox fare per seat (₹)"
                value={fare}
                onChangeText={setFare}
                keyboardType="decimal-pad"
              />
              {result.data.circles.some((c) => c.role === 'owner') && (
                <>
                  <Text style={s.muted}>Who can request a seat?</Text>
                  <Button
                    secondary
                    title={(circle ? '' : '✓ ') + 'Public'}
                    onPress={() => setCircle('')}
                  />
                  {result.data.circles
                    .filter((c) => c.role === 'owner')
                    .map((c) => (
                      <Button
                        key={c.id}
                        secondary
                        title={(circle === c.id ? '✓ ' : '') + c.name}
                        onPress={() => setCircle(c.id)}
                      />
                    ))}
                </>
              )}
              <Text style={s.muted}>
                You approve each passenger’s request. Fares use sandbox accounting.
              </Text>
              <Button
                title="Publish ride"
                disabled={action.busy}
                onPress={() => void action.run(publish)}
              />
            </Card>
          </>
        ))}
      <Feedback message={action.error} />
    </View>
  );
}
