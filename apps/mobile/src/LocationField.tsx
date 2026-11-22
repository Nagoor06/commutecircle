import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { Field, Button, s } from './ui';
import { km, suggestions, Suggestion } from './places';
import type { Place, Point } from './types';

export function LocationField({
  label,
  place,
  onChange,
  bias,
}: {
  label: string;
  place: Place;
  onChange: (p: Place) => void;
  bias?: Point;
}) {
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [hint, setHint] = useState('');
  const lat = bias?.lat,
    lon = bias?.lon;
  useEffect(() => {
    const q = place.name.trim();
    if (!editing || q.length < 2) {
      setItems([]);
      setHint('');
      return;
    }
    const abort = new AbortController();
    setItems([]);
    setHint('Looking for places…');
    const timer = setTimeout(async () => {
      const near = lat == null || lon == null ? undefined : { lat, lon };
      try {
        const matches = await suggestions(q, near, abort.signal);
        if (!abort.signal.aborted) {
          setItems(matches);
          setHint(matches.length ? '' : 'No suggestions. You can search by stop name.');
        }
      } catch {
        if (!abort.signal.aborted) setHint('Place lookup unavailable. You can still enter a stop name.');
      }
    }, 350);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [place.name, editing, lat, lon]);
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        value={place.name}
        maxLength={80}
        placeholder="Search for a city or public place"
        onChangeText={(name) => {
          setEditing(true);
          onChange({ name });
        }}
      />
      {editing && hint ? <Text style={s.muted}>{hint}</Text> : null}
      {items.map((item) => (
        <Pressable
          accessibilityRole="button"
          key={item.name + item.lat + item.lon}
          onPress={() => {
            setEditing(false);
            onChange({ name: item.name, lat: item.lat, lon: item.lon });
          }}
          style={s.card}
        >
          <Text style={s.body}>{item.name}</Text>
          <Text style={s.muted}>
            {[item.area, bias && km(item, bias).toFixed(1) + ' km away'].filter(Boolean).join(' · ')}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
export function usePickup(auto: boolean) {
  const [point, setPoint] = useState<Place>({ name: '' });
  const [area, setArea] = useState<Point>();
  const [hint, setHint] = useState('');
  const generation = useRef(0);
  const manual = (p: Place) => {
    generation.current++;
    setPoint(p);
    setHint('');
  };
  async function locate(ask: boolean) {
    const version = ++generation.current;
    const current = () => version === generation.current;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      let perm = await Location.getForegroundPermissionsAsync();
      if (!current()) return;
      if (!perm.granted && !ask) return;
      if (!perm.granted && perm.canAskAgain) perm = await Location.requestForegroundPermissionsAsync();
      if (!current()) return;
      if (!perm.granted) {
        setHint('Location is off. Enter a pickup, or allow location in Android settings.');
        return;
      }
      setHint('Finding your pickup…');
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 60000, requiredAccuracy: 2000 });
      const fix =
        cached ??
        (await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(Error('Location timed out.')), 9000);
          }),
        ]));
      if (!current()) return;
      const near = {
        lat: Number(fix.coords.latitude.toFixed(2)),
        lon: Number(fix.coords.longitude.toFixed(2)),
      };
      if (Math.abs(near.lat) > 85) throw Error('Outside map coverage.');
      setArea(near);
      setPoint({ name: 'Current location', ...near });
      setHint('Approximate pickup. Choose a public meeting point before travelling.');
    } catch {
      if (current()) setHint('Could not get a location. Enter your pickup or try again.');
    } finally {
      clearTimeout(timer);
    }
  }
  useEffect(() => {
    if (auto) void locate(false);
    return () => {
      generation.current++;
    };
  }, [auto]);
  return {
    point,
    manual,
    area,
    control: (
      <>
        <Button secondary title="Use current location" onPress={() => void locate(true)} />
        {hint ? <Text style={s.muted}>{hint}</Text> : null}
      </>
    ),
  };
}
