import { useCallback, useState } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';
import { useMobile } from '../context';
import { useResource } from '../hooks';
import { LocationField, usePickup } from '../LocationField';
import { RouteMap } from '../RouteMap';
import { wirePlace } from '../places';
import { Button, Card, color, Feedback, LoadState, s } from '../ui';
import { Match, Place, Point, Search, money, when } from '../types';

export function RideCard({ item }: { item: Match }) {
  const { open } = useMobile();
  const j = item.journey;
  return (
    <Card>
      <Text style={s.heading}>
        {j.stops[item.board].name} → {j.stops[item.alight].name}
      </Text>
      <Text style={s.body}>
        {when(new Date(Date.parse(j.departure) + j.stops[item.board].minutes * 60000).toISOString())}
      </Text>
      <Text style={s.muted}>
        {j.driver_name || 'Driver'} ·{' '}
        {j.driver_verified ? 'Verified driver' : 'Verification unconfirmed'}
      </Text>
      {item.match.fare_paise != null && (
        <Text style={s.body}>{money(item.match.fare_paise)} per seat · sandbox</Text>
      )}
      <Button
        title="View ride"
        onPress={() => open({ screen: 'ride', id: j.id, board: item.board, alight: item.alight })}
      />
    </Card>
  );
}
type Query = { origin?: Place; destination?: Place };
function Results({ query }: { query: Query }) {
  const { api } = useMobile();
  const [page, setPage] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) =>
      api<Search>('/v1/journeys/search', {
        method: 'POST',
        body: { ...query, offset: page * 20 },
        signal,
        timeout: 65000,
      }),
    [api, query, page],
  );
  const result = useResource(load);
  return (
    <>
      <Text style={s.heading}>Available rides</Text>
      <LoadState {...result} />
      {!result.loading && !result.error && !result.data?.items.length && (
        <Card>
          <Text style={s.body}>No rides match this search yet.</Text>
        </Card>
      )}
      {result.data?.items.map((item) => (
        <RideCard key={item.journey.id} item={item} />
      ))}
      <View style={s.row}>
        {page > 0 && <Button secondary title="Previous rides" onPress={() => setPage((p) => p - 1)} />}
        {result.data?.more && (
          <Button secondary title="More rides" onPress={() => setPage((p) => p + 1)} />
        )}
      </View>
    </>
  );
}
export function Book() {
  const pickup = usePickup(true);
  const [destination, setDestination] = useState<Place>({ name: '' });
  const [query, setQuery] = useState<Query | null>(null);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  function search(all = false) {
    setError('');
    if (!all && (!pickup.point.name.trim() || !destination.name.trim())) {
      setError('Enter a pickup and a drop-off.');
      return;
    }
    if (
      !all &&
      pickup.point.name.trim().toLowerCase() === destination.name.trim().toLowerCase() &&
      pickup.point.lat === destination.lat &&
      pickup.point.lon === destination.lon
    ) {
      setError('Choose two different stops.');
      return;
    }
    setGeneration((n) => n + 1);
    setQuery(all ? {} : { origin: wirePlace(pickup.point), destination: wirePlace(destination) });
  }
  const bias = pickup.area ?? (pickup.point.lat != null ? (pickup.point as Point) : undefined);
  return (
    <View style={s.screen}>
      <ImageBackground source={require('../../assets/city-commute.png')} resizeMode="cover"
        accessible={false} imageStyle={hero.image} style={hero.frame}>
        <Text accessibilityRole="header" style={[s.title, hero.title]}>Book a ride</Text>
      </ImageBackground>
      <RouteMap stops={[pickup.point, destination]} onSetStop={(end, p) => {
        if (end === 'pickup') pickup.manual(p);
        else setDestination(p);
        setQuery(null);
        setError('');
      }} />
      <Card>
        <LocationField
          label="Pickup"
          place={pickup.point}
          onChange={(p) => {
            pickup.manual(p);
            setQuery(null);
          }}
          bias={pickup.area}
        />
        {pickup.control}
        <LocationField
          label="Drop-off"
          place={destination}
          onChange={(p) => {
            setDestination(p);
            setQuery(null);
          }}
          bias={bias}
        />
        <Feedback message={error} />
        <Button title="Find rides" onPress={() => search()} />
        <Button title="Browse all rides" secondary onPress={() => search(true)} />
      </Card>
      {query && <Results key={generation} query={query} />}
    </View>
  );
}

const hero = StyleSheet.create({
  frame: { minHeight: 112, borderRadius: 16, backgroundColor: color.navy, padding: 14, justifyContent: 'flex-end', alignItems: 'flex-start' },
  image: { borderRadius: 16 },
  title: { color: color.white, backgroundColor: '#14213DEB', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3 },
});
