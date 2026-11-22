import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { useMobile } from './context';
import { useResource } from './hooks';
import { Button, s } from './ui';
type Row = { message_id: string; journey_id: string; ticket_id: string; created_at: string };
export function Unread({ chat, onCount }: { chat?: string; onCount: (n: number) => void }) {
  const { api, open } = useMobile();
  const load = useCallback(
    (signal: AbortSignal) =>
      api<{ unread: number; items: Row[] }>('/v1/me/conversations/summary', { signal }),
    [api],
  );
  const { data } = useResource(load, 8000);
  const seen = useRef<Set<string> | null>(null),
    watermark = useRef(0);
  const [latest, setLatest] = useState<Row>();
  useEffect(() => {
    if (!data) return;
    onCount(data.unread);
    const next = data.items.find(
      (row) =>
        seen.current &&
        !seen.current.has(row.message_id) &&
        Date.parse(row.created_at) >= watermark.current &&
        row.ticket_id !== chat,
    );
    if (!data.unread) setLatest(undefined);
    else if (next) setLatest(next);
    else if (
      latest &&
      (latest.ticket_id === chat || !data.items.some((row) => row.message_id === latest.message_id))
    )
      setLatest(undefined);
    watermark.current = Math.max(
      watermark.current,
      ...data.items.map((row) => Date.parse(row.created_at)),
    );
    seen.current = new Set(data.items.map((row) => row.message_id));
  }, [data, chat, onCount, latest]);
  return latest && latest.ticket_id !== chat ? (
    <View style={[s.card, { marginHorizontal: 12 }]}>
      <Text style={s.heading}>New booking message</Text>
      <View style={s.row}>
        <Button
          secondary
          title="Open chat"
          onPress={() => {
            open({ screen: 'chat', journey: latest.journey_id, ticket: latest.ticket_id });
            setLatest(undefined);
          }}
        />
        <Button secondary title="Dismiss" onPress={() => setLatest(undefined)} />
      </View>
    </View>
  ) : null;
}
