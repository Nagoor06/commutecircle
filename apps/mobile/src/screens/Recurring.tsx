import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Crypto from 'expo-crypto';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { Eligibility, Journey, Stop } from '../types';
import { Button, Card, color, Feedback, Heading, LoadState, s } from '../ui';

const base = '/v1/recurring-rides';
const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const dayMs = 86400000;
type Schedule = { id: string; stops: Stop[]; local_time: string; weekdays: number[];
  starts_on: string; ends_on: string; active: boolean; circle_id: string | null };
const pilotDay = (offset = 0) => new Date(Date.now() + 19800000 + offset * dayMs).toISOString().slice(0, 10);
const addDays = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * dayMs).toISOString().slice(0, 10);
const asLocalDate = (day: string) => new Date(day + 'T12:00:00');
const two = (n: number) => String(n).padStart(2, '0');

function chooseDay(value: string, min: string, max: string | undefined, select: (day: string) => void) {
  const clamped = value < min ? min : max && value > max ? max : value;
  DateTimePickerAndroid.open({ mode: 'date', value: asLocalDate(clamped), minimumDate: asLocalDate(min),
    ...(max ? { maximumDate: asLocalDate(max) } : {}),
    onValueChange: (_, date) => select(date.getFullYear() + '-' + two(date.getMonth() + 1) + '-' + two(date.getDate())),
  });
}

function Template({ item }: { item: Schedule }) {
  const { api } = useMobile(), action = useAction();
  const [notice, setNotice] = useState('');
  const today = pilotDay(), first = item.starts_on < today ? today : item.starts_on;
  const ended = first > item.ends_on || !item.active;
  const path = base + '/' + encodeURIComponent(item.id);
  function skip(day: string) {
    if (!item.weekdays.includes((new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7)) {
      setNotice('This schedule does not run on that weekday.');
      return;
    }
    Alert.alert('Skip ' + day + '?', 'This removes that departure from your schedule.', [
      { text: 'Keep date', style: 'cancel' }, { text: 'Skip date', onPress: () => void action.run(async () => {
        setNotice('');
        await api(path + '/exceptions/' + day, { method: 'PUT', body: { reason: 'Driver not travelling' } });
        setNotice('Skipped ' + day + '.');
      }) },
    ]);
  }
  return <Card>
    <Text style={s.heading}>{item.stops[0].name} → {item.stops[item.stops.length - 1].name}</Text>
    <Text style={s.body}>{item.weekdays.map((n) => week[n]).join(', ')} · {item.local_time.slice(0, 5)} IST</Text>
    <Text style={s.muted}>{item.starts_on} to {item.ends_on} · {item.circle_id ? 'Circle members' : 'Public'}</Text>
    {ended ? <Text style={s.muted}>Schedule ended</Text> : <>
      <Button title="Create next 14 days" disabled={action.busy} onPress={() => void action.run(async () => {
        setNotice('');
        const result = await api<{ count: number }>(path + '/materialize', { method: 'POST' });
        setNotice(result.count ? 'Upcoming rides created: ' + result.count + '.' : 'No new departures to create in the next 14 days.');
      })} />
      <Button secondary title="Skip a date" disabled={action.busy} onPress={() => chooseDay(first, first, item.ends_on, skip)} />
    </>}
    {notice && <Text accessibilityLiveRegion="polite" style={s.body}>{notice}</Text>}
    <Feedback message={action.error} />
  </Card>;
}

export function Recurring() {
  const { api, open } = useMobile();
  const load = useCallback((signal: AbortSignal) => api<Schedule[]>(base, { signal }), [api]);
  const state = useResource(load);
  return <View style={s.screen}><Heading>Recurring rides</Heading>
    <Text style={s.body}>Choose a published ride in My trips and tap Repeat this route to set a weekly schedule.</Text>
    <Button title="Choose a ride in My trips" onPress={() => open({ tab: 'Trips' })} />
    <LoadState {...state} />
    {state.data?.length === 0 && <Text style={s.muted}>You have no weekly schedules yet.</Text>}
    {state.data?.map((t) => <Template key={t.id} item={t} />)}
  </View>;
}

export function Repeat({ id }: { id: string }) {
  const { api } = useMobile();
  const load = useCallback((signal: AbortSignal) =>
    api<Journey>('/v1/journeys/' + encodeURIComponent(id), { signal }), [api, id]);
  const state = useResource(load);
  if (!state.data) return <LoadState {...state} />;
  if (!state.data.owner || state.data.cancelled || Date.parse(state.data.departure) <= Date.now())
    return <Text style={s.body}>Choose one of your upcoming published rides to repeat.</Text>;
  return <ScheduleForm journey={state.data} />;
}

function ScheduleForm({ journey }: { journey: Journey }) {
  const { api, open } = useMobile(), action = useAction();
  const load = useCallback((signal: AbortSignal) => api<Eligibility>('/v1/me/driver-eligibility', { signal }), [api]);
  const eligibility = useResource(load);
  const [start, setStart] = useState(() => pilotDay(1)), [end, setEnd] = useState(() => pilotDay(30));
  const [time, setTime] = useState(() => new Date(Date.parse(journey.departure) + 19800000).toISOString().slice(11, 16));
  const [days, setDays] = useState([0, 1, 2, 3, 4]), [chosen, setChosen] = useState('');
  const request = useRef({ payload: '', id: '' });
  const vehicles = eligibility.data?.vehicles.filter((v) => v.status === 'approved' && v.seat_capacity >= journey.capacity) ?? [];
  const vehicle = vehicles.find((v) => v.id === chosen) ?? vehicles.find((v) => v.id === journey.vehicle_id) ?? vehicles[0];
  const canSave = journey.owner && !journey.cancelled && eligibility.data?.driver_status === 'approved' && vehicle && days.length > 0;
  const save = () => void action.run(async () => {
    if (!canSave || !vehicle) return;
    if (start < pilotDay() || end < start || end > addDays(start, 89)) throw Error('Choose upcoming dates spanning at most 90 days.');
    const data = { stops: journey.stops, local_time: time + ':00', timezone: 'Asia/Kolkata', weekdays: days,
      starts_on: start, ends_on: end, price_paise: journey.price_paise, capacity: journey.capacity,
      vehicle_id: vehicle.id, booking_mode: 'approval', ...(journey.circle_id ? { circle_id: journey.circle_id } : {}) };
    const payload = JSON.stringify(data);
    if (request.current.payload !== payload) request.current = { payload, id: Crypto.randomUUID() };
    await api(base, { method: 'POST', body: { ...data, template_id: request.current.id } });
    open({ tab: 'Recurring' });
  });
  return <View style={s.screen}><Heading>Repeat this route</Heading>
    <Card><Text style={s.heading}>{journey.stops[0].name} → {journey.stops[journey.stops.length - 1].name}</Text>
      <Text style={s.muted}>{journey.capacity} seats · {journey.circle_id ? 'Same private circle' : 'Public ride'} · Driver approval</Text>
      <Text style={s.muted}>The weekly scheduling pilot uses India time (IST, UTC+05:30).</Text>
      <Button secondary title={'Departure · ' + time + ' IST'} onPress={() =>
        DateTimePickerAndroid.open({ mode: 'time', is24Hour: true, value: new Date('2000-01-01T' + time + ':00'),
          onValueChange: (_, d) => setTime(two(d.getHours()) + ':' + two(d.getMinutes())) })} />
      <Text style={s.body}>Travel days</Text><View style={s.row}>
        {week.map((day, n) => <Pressable key={day} accessibilityRole="checkbox" accessibilityLabel={day}
          accessibilityState={{ checked: days.includes(n) }} style={[s.button, !days.includes(n) && s.secondary]}
          onPress={() => setDays((old) => old.includes(n) ? old.filter((d) => d !== n) : [...old, n].sort())}>
          <Text style={{ color: days.includes(n) ? color.white : color.blue }}>{day}</Text>
        </Pressable>)}</View>
      <Button secondary title={'Starts · ' + start} onPress={() => chooseDay(start, pilotDay(), undefined, (day) => {
        setStart(day);
        setEnd((old) => old < day ? day : old > addDays(day, 89) ? addDays(day, 89) : old);
      })} />
      <Button secondary title={'Ends · ' + end} onPress={() => chooseDay(end, start, addDays(start, 89), setEnd)} />
      <LoadState {...eligibility} />
      {vehicles.map((v) => <Button key={v.id} secondary title={(v.id === vehicle?.id ? '✓ ' : '') + v.color + ' ' + v.make + ' ' + v.model}
        onPress={() => setChosen(v.id)} />)}
      {eligibility.data && (!vehicles.length || eligibility.data.driver_status !== 'approved') &&
        <Button secondary title="Review driver and vehicle verification" onPress={() => open({ tab: 'Profile' })} />}
      <Text style={s.muted}>After saving, choose Create next 14 days to publish departures for riders.</Text>
      <Button title="Save weekly schedule" disabled={!canSave || action.busy} onPress={save} />
      <Feedback message={action.error} />
    </Card>
  </View>;
}
