import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { Button, Card, Feedback, Field, Heading, LoadState, s } from '../ui';
import { Chat, Thread, ticketPath, when } from '../types';
export function Inbox() {
  const { api, open } = useMobile();
  const [page, setPage] = useState(0);
  const load = useCallback(
    (signal: AbortSignal) =>
      api<{ items: Thread[]; has_more: boolean }>('/v1/me/conversations?offset=' + page * 20, {
        signal,
      }),
    [api, page],
  );
  const result = useResource(load, 8000);
  return (
    <View style={s.screen}>
      <Heading>Inbox</Heading>
      <LoadState {...result} />
      {result.data?.items.length === 0 && (
        <Card>
          <Text style={s.body}>No conversations yet. A confirmed booking opens a private chat.</Text>
        </Card>
      )}
      {result.data?.items.map((row) => (
        <Card key={row.ticket_id}>
          <Text style={s.heading}>
            {row.origin} → {row.destination}
          </Text>
          {row.guest_name && <Text style={s.body}>Booked for {row.guest_name}</Text>}
          <Text style={s.muted}>
            {row.closed ? 'Closed conversation' : row.unread ? row.unread + ' unread' : 'Booking chat'}
          </Text>
          {row.preview && (
            <Text numberOfLines={2} style={s.body}>
              {row.preview}
            </Text>
          )}
          <Button
            secondary
            title="Open chat"
            onPress={() => open({ screen: 'chat', journey: row.journey_id, ticket: row.ticket_id })}
          />
        </Card>
      ))}
      <View style={s.row}>
        {page > 0 && (
          <Button secondary title="Previous conversations" onPress={() => setPage((p) => p - 1)} />
        )}
        {result.data?.has_more && (
          <Button secondary title="More conversations" onPress={() => setPage((p) => p + 1)} />
        )}
      </View>
    </View>
  );
}
export function Conversation({ journey, ticket }: { journey: string; ticket: string }) {
  const { api } = useMobile(),
    path = ticketPath(journey, ticket) + '/messages';
  const load = useCallback((signal: AbortSignal) => api<Chat>(path, { signal }), [api, path]);
  const result = useResource(load, 5000),
    action = useAction();
  const [draft, setDraft] = useState(''),
    [notice, setNotice] = useState('');
  const pending = useRef({ text: '', id: '' }),
    acknowledged = useRef(''),
    reading = useRef<AbortController | null>(null);
  const chat = result.data;
  const incoming = chat?.messages.filter((m) => m.sender !== chat.role).at(-1)?.id;
  useEffect(() => () => {
    reading.current?.abort();
    reading.current = null;
  }, [path]);
  useEffect(() => {
    if (!incoming || incoming === acknowledged.current || reading.current) return;
    const abort = new AbortController();
    reading.current = abort;
    void api(path + '/read', { method: 'POST', signal: abort.signal, body: { message_id: incoming } })
      .then(() => {
        if (!abort.signal.aborted) acknowledged.current = incoming;
      })
      .catch(() => {})
      .finally(() => { if (reading.current === abort) reading.current = null; });
  }, [api, path, incoming, chat]);
  function send() {
    void action.run(async () => {
      const text = draft.trim();
      if (!text) return;
      if (pending.current.text !== text) pending.current = { text, id: Crypto.randomUUID() };
      await api(path, { method: 'POST', body: { message_id: pending.current.id, text } });
      setDraft('');
      pending.current = { text: '', id: '' };
      setNotice('Message sent.');
      result.refresh();
    });
  }
  return (
    <View style={s.screen}>
      <Heading>Booking chat</Heading>
      <LoadState {...result} />
      {chat && (
        <>
          <Card>
            {chat.guest_name && <Text style={s.body}>Driver and booker chat · Booked for {chat.guest_name}</Text>}
            {chat.messages.length === 0 && <Text style={s.muted}>No messages yet.</Text>}
            {chat.messages.map((m) => (
              <View key={m.id} style={{ gap: 2 }}>
                <Text style={s.muted}>
                  {m.sender === chat.role ? 'You' : m.sender === 'passenger' && chat.guest_name ? 'Booker' : m.sender} · {when(m.created_at)}
                </Text>
                <Text style={s.body}>{m.text}</Text>
              </View>
            ))}
          </Card>
          {chat.closed ? (
            <Text style={s.body}>This conversation is closed.</Text>
          ) : (
            <Card>
              <Field
                label="Message"
                multiline
                maxLength={500}
                editable={!action.busy}
                value={draft}
                onChangeText={(v) => {
                  setDraft(v);
                  setNotice('');
                }}
              />
              <Button title="Send message" disabled={action.busy || !draft.trim()} onPress={send} />
              <Button
                secondary
                title="Block conversation"
                onPress={() =>
                  Alert.alert('Block this conversation?', 'Messages will close for both participants.', [
                    { text: 'Keep chatting', style: 'cancel' },
                    {
                      text: 'Block',
                      style: 'destructive',
                      onPress: () =>
                        void action.run(async () => {
                          await api(path + '/block', { method: 'POST' });
                          result.refresh();
                        }),
                    },
                  ])
                }
              />
            </Card>
          )}
        </>
      )}
      {notice ? <Text style={s.muted}>{notice}</Text> : null}
      <Feedback message={action.error} />
    </View>
  );
}
