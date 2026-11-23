import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Camera, GeoJSONSource, Layer, Map, type LngLat, type MapRef, type StyleSpecification } from '@maplibre/maplibre-react-native';
import { jsonRequest } from './api';
import { coordinate, frame, offlineStyle, pinData, Road, roadRoute, routeLine, streetStyleUrl } from './mapData';
import type { Place } from './types';
import { Button, color, s } from './ui';

type Props = {
  stops: Place[];
  onSetStop?: (end: 'pickup' | 'dropoff', place: Place) => void;
  onEstimate?: (road: Road) => void;
};
type Streets = 'loading' | 'ready' | 'unavailable';

// Cache the public stylesheet only. Stops and road queries belong to the current screen.
let streetStyle: StyleSpecification | undefined;
function useStreets(attempt: number) {
  const [style, setStyle] = useState(streetStyle);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const abort = new AbortController();
    setFailed(false);
    if (!streetStyle) {
      void jsonRequest<StyleSpecification>(streetStyleUrl, { signal: abort.signal, timeout: 6500 })
        .then((data) => {
          if (abort.signal.aborted) return;
          if (data.version !== 8 || !Array.isArray(data.layers) || !data.sources) throw Error();
          streetStyle = {
            ...data,
            sources: { ...data.sources, ...offlineStyle.sources },
            layers: [...offlineStyle.layers, ...data.layers.filter((l) => l.type !== 'background')],
          };
          setStyle(streetStyle);
        }).catch(() => { if (!abort.signal.aborted) setFailed(true); });
    } else setStyle(streetStyle);
    return () => abort.abort();
  }, [attempt]);
  return { style, failed };
}

function Canvas({ points, route, road, expanded, choose, pending, onExpand }:
  { points: (LngLat | null)[]; route: LngLat[]; road: boolean; expanded: boolean;
    choose?: (p: LngLat) => void; pending: LngLat | null; onExpand?: () => void }) {
  const [attempt, setAttempt] = useState(0), [recenter, setRecenter] = useState(0);
  const { style, failed } = useStreets(attempt);
  const [streets, setStreets] = useState<Streets>('loading');
  const map = useRef<MapRef>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ready = useRef(false), checking = useRef(false), generation = useRef(0);
  const base = style && !failed && streets !== 'unavailable' ? style : offlineStyle;
  const camera = useMemo(() => frame(points.filter((p): p is LngLat => !!p)), [points]);
  useEffect(() => {
    const current = ++generation.current;
    ready.current = false;
    checking.current = false;
    setStreets(failed ? 'unavailable' : 'loading');
    const timer = setTimeout(() => {
      if (!ready.current && current === generation.current) setStreets('unavailable');
    }, style ? 15000 : 10000);
    return () => { generation.current++; clearTimeout(timer); };
  }, [style, failed, attempt]);
  async function rendered() {
    if (!style || failed || base === offlineStyle || !map.current || ready.current || checking.current || !size.w) return;
    const current = generation.current;
    checking.current = true;
    try {
      // Query only data layers, excluding the background and our own stop markers.
      const layers = style.layers.filter((l) => 'source-layer' in l &&
        (l.type === 'symbol' || ['water', 'landcover', 'transportation'].includes(l['source-layer'] ?? ''))).map((l) => l.id);
      const features = await map.current.queryRenderedFeatures([[0, 0], [size.w, size.h]], { layers });
      if (current === generation.current && features.length) {
        ready.current = true;
        setStreets('ready');
      }
    } catch { /* Another frame can finish while the native style is switching. */ }
    finally { if (current === generation.current) checking.current = false; }
  }
  const pins = useMemo(() => pinData(points), [points]);
  return (
    <View style={expanded ? css.mapBody : undefined}>
      <View style={expanded ? css.mapBody : css.preview}
        onLayout={(e) => { const { width: w, height: h } = e.nativeEvent.layout; setSize({ w, h }); }}>
        <Map key={attempt} ref={map} androidView="texture" style={StyleSheet.absoluteFill}
          mapStyle={base} dragPan={expanded} touchZoom={expanded} doubleTapZoom={expanded}
          touchPitch={false} touchRotate={false} compass={false} logo={false}
          onDidFinishRenderingMapFully={() => void rendered()}
          onRegionDidChange={() => void rendered()}
          onDidFailLoadingMap={() => { if (base !== offlineStyle) setStreets('unavailable'); }}
          onPress={choose ? (e) => {
            const [lng, lat] = e.nativeEvent.lngLat;
            if (Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 85) choose([((lng + 180) % 360 + 360) % 360 - 180, lat]);
          } : undefined}>
          <Camera key={JSON.stringify(camera) + ':' + recenter} initialViewState={camera} {...camera} maxZoom={18} />
          {route.length > 1 && <GeoJSONSource id="ride-line" data={routeLine(route)}>
            <Layer id="ride-path" type="line" paint={{ 'line-color': color.blue, 'line-width': road ? 4 : 2,
              ...(road ? {} : { 'line-dasharray': [3, 2] }) }} />
          </GeoJSONSource>}
          <GeoJSONSource id="ride-pins" data={pins}>
            <Layer id="ride-stops" type="circle" paint={{ 'circle-radius': 7, 'circle-stroke-width': 2,
              'circle-stroke-color': '#ffffff', 'circle-color': ['match', ['get', 'role'],
                'pickup', color.blue, 'dropoff', '#ae482e', color.navy] }} />
          </GeoJSONSource>
          {pending && <GeoJSONSource id="selected-point" data={{ type: 'Point', coordinates: pending }}>
            <Layer id="selection-ring" type="circle" paint={{ 'circle-radius': 10, 'circle-color': '#ffffff',
              'circle-opacity': 0.65, 'circle-stroke-color': color.navy, 'circle-stroke-width': 3 }} />
          </GeoJSONSource>}
        </Map>
        {!expanded && <Pressable onPress={onExpand} accessibilityRole="button" accessibilityLabel="Expand route map"
          style={css.expand}><Text style={css.mapAction}>Expand map ↗</Text></Pressable>}
        {expanded && <Pressable onPress={() => setRecenter((n) => n + 1)} accessibilityRole="button"
          style={css.expand}><Text style={css.mapAction}>Fit stops</Text></Pressable>}
      </View>
      <View style={css.caption}>
        <Text style={css.note} accessibilityLiveRegion="polite">
          {streets === 'ready' ? 'Street map' : streets === 'unavailable' || failed ? 'Street map unavailable · offline overview' : 'Loading street map…'}
        </Text>
        {(failed || streets === 'unavailable') && <Pressable accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={css.retry}>
          <Text style={css.mapAction}>Retry map</Text></Pressable>}
      </View>
      <Text style={css.credit}>© OpenStreetMap contributors · OpenFreeMap · Natural Earth</Text>
    </View>
  );
}

export function RouteMap({ stops, onSetStop, onEstimate }: Props) {
  const key = JSON.stringify(stops.map(coordinate));
  const points = useMemo<(LngLat | null)[]>(() => JSON.parse(key), [key]);
  const mapped = useMemo(() => points.filter((p): p is LngLat => !!p), [points]);
  const complete = mapped.length > 1 && mapped.length === stops.length && mapped.some((p) =>
    p[0] !== mapped[0][0] || p[1] !== mapped[0][1]);
  const [route, setRoute] = useState<{ key: string; road?: Road; failed?: boolean }>();
  const [retry, setRetry] = useState(0), [full, setFull] = useState(false);
  const [pending, setPending] = useState<LngLat | null>(null);
  useEffect(() => {
    if (!complete) return;
    const abort = new AbortController();
    setRoute({ key });
    void roadRoute(mapped, abort.signal).then((road) => {
      if (!abort.signal.aborted) setRoute({ key, road });
    }).catch(() => { if (!abort.signal.aborted) setRoute({ key, failed: true }); });
    return () => abort.abort();
  }, [mapped, key, complete, retry]);
  const road = route?.key === key ? route.road : undefined;
  const line = road?.geometry ?? (complete ? mapped : []);
  const open = () => { Keyboard.dismiss(); setPending(null); setFull(true); };
  const close = () => { setFull(false); setPending(null); };
  const save = (end: 'pickup' | 'dropoff') => {
    if (!pending || !onSetStop) return;
    const [lon, lat] = pending;
    onSetStop(end, { name: lat.toFixed(5) + ', ' + lon.toFixed(5), lat, lon });
    close();
  };
  return (
    <View style={css.card}>
      {!full && <Canvas points={points} route={line} road={!!road} expanded={false} pending={null} onExpand={open} />}
      {stops.some((p, i) => p.name.trim() && !points[i]) && <View style={css.legend}>
        <Text style={s.muted}>Named stops need a mapped suggestion or a pin to show their position.</Text>
      </View>}
      {mapped.length > 0 && <View style={css.legend}>
        {stops.map((p, i) => points[i] && <Text key={i} style={css.note}>
          {i === 0 ? 'Pickup' : i === stops.length - 1 ? 'Drop-off' : 'Stop ' + (i + 1)} · {p.name}</Text>)}
      </View>}
      {complete && <View style={css.legend}>
        <Text style={s.muted}>{road ? 'Driving route · ' + (road.distance / 1000).toFixed(1) + ' km · about ' +
          Math.max(1, Math.round(road.duration / 60)) + ' min' : 'Dashed line connects stops directly.'}</Text>
        {route?.key === key && route.failed && <Button secondary title="Retry driving route" onPress={() => setRetry((n) => n + 1)} />}
        {road && onEstimate && <Button secondary title="Use road distance and time" onPress={() => onEstimate(road)} />}
      </View>}
      {full && <Modal visible onRequestClose={close} animationType="slide">
        <SafeAreaView style={css.full}>
          <View style={css.header}><Text accessibilityRole="header" style={s.heading}>Route map</Text>
            <Button secondary title="Close map" onPress={close} /></View>
          <Canvas points={points} route={line} road={!!road} expanded pending={pending} choose={onSetStop ? setPending : undefined} />
          {onSetStop && <ScrollView style={css.actions} contentContainerStyle={css.actionContent}>
            <Text style={s.body}>{pending ? 'Selected pin · ' + pending[1].toFixed(4) + ', ' + pending[0].toFixed(4) :
              'Tap a public meeting point on the map.'}</Text>
            <View style={s.row}><Button title="Set pickup" disabled={!pending} onPress={() => save('pickup')} />
              <Button secondary title="Set drop-off" disabled={!pending} onPress={() => save('dropoff')} /></View>
          </ScrollView>}
        </SafeAreaView>
      </Modal>}
    </View>
  );
}

const css = StyleSheet.create({
  card: { backgroundColor: color.white, borderColor: color.line, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  preview: { height: 166, backgroundColor: '#c4dfed' }, mapBody: { flex: 1, minHeight: 0 },
  full: { flex: 1, backgroundColor: color.white }, header: { flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  expand: { position: 'absolute', top: 8, right: 8, minHeight: 44, justifyContent: 'center',
    backgroundColor: '#ffffffef', borderRadius: 12, paddingHorizontal: 13 },
  caption: { paddingHorizontal: 12, paddingTop: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  note: { color: color.ink, fontWeight: '600', fontSize: 13, flexShrink: 1 },
  credit: { color: color.muted, fontSize: 11, paddingHorizontal: 12, paddingBottom: 7 },
  mapAction: { color: color.blue, fontSize: 14, fontWeight: '700' }, legend: { paddingHorizontal: 12, paddingBottom: 8, gap: 4 },
  actions: { flexGrow: 0, maxHeight: '35%' }, actionContent: { padding: 12, gap: 9 },
});
