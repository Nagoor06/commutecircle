import { useCallback, useState } from 'react';
import { Alert, Share, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { Button, Card, Feedback, Field, Heading, LoadState, s } from '../ui';
import { Circle, Match, when } from '../types';
import { RideCard } from './Book';
export function Circles() {
  const { api, open } = useMobile();
  const load = useCallback((signal: AbortSignal) => api<Circle[]>('/v1/circles', { signal }), [api]);
  const result = useResource(load),
    action = useAction();
  const [name, setName] = useState(''),
    [token, setToken] = useState('');
  return (
    <View style={s.screen}>
      <Heading>My circles</Heading>
      <LoadState {...result} />
      {result.data?.map((c) => (
        <Card key={c.id}>
          <Text style={s.heading}>{c.name}</Text>
          <Button secondary title="Open circle" onPress={() => open({ screen: 'circle', circle: c })} />
        </Card>
      ))}
      <Card>
        <Field label="Circle name" value={name} maxLength={80} onChangeText={setName} />
        <Button
          title="Create circle"
          disabled={action.busy || name.trim().length < 3}
          onPress={() =>
            void action.run(async () => {
              await api('/v1/circles', { method: 'POST', body: { name: name.trim() } });
              setName('');
              result.refresh();
            })
          }
        />
      </Card>
      <Card>
        <Field
          label="Invitation token"
          autoCapitalize="none"
          autoCorrect={false}
          value={token}
          maxLength={256}
          onChangeText={setToken}
        />
        <Button
          title="Join circle"
          disabled={action.busy || token.trim().length < 32}
          onPress={() =>
            void action.run(async () => {
              await api('/v1/circle-invitations/redeem', {
                method: 'POST',
                body: { token: token.trim() },
              });
              setToken('');
              result.refresh();
            })
          }
        />
      </Card>
      <Feedback message={action.error} />
    </View>
  );
}
export function CircleDetail({ circle }: { circle: Circle }) {
  const { api, open } = useMobile(),
    path = '/v1/circles/' + circle.id;
  const load = useCallback(
    (signal: AbortSignal) => api<Match[]>(path + '/journeys', { signal }),
    [api, path],
  );
  const result = useResource(load),
    action = useAction();
  const [invite, setInvite] = useState<{ token: string; expires_at: string }>(),
    [info, setInfo] = useState('');
  const message = invite
    ? 'You’re invited to ' +
      circle.name +
      ' on CommuteCircle. Open Circles → Join circle and paste this one-time token: ' +
      invite.token
    : '';
  return (
    <View style={s.screen}>
      <Heading>{circle.name}</Heading>
      <LoadState {...result} />
      {result.data?.length === 0 && <Text style={s.body}>No available rides in this circle.</Text>}
      {result.data?.map((m) => (
        <RideCard key={m.journey.id} item={m} />
      ))}
      {circle.role === 'owner' ? (
        <Card>
          <Button
            title="Create one-time invitation"
            disabled={action.busy}
            onPress={() =>
              void action.run(async () => {
                setInfo('');
                setInvite(await api(path + '/invitations', { method: 'POST' }));
              })
            }
          />
          {invite && (
            <>
              <Text style={s.muted}>Expires {when(invite.expires_at)}. Share privately.</Text>
              <Text selectable style={s.body}>
                {invite.token}
              </Text>
              <Button
                secondary
                title="Copy token"
                onPress={() =>
                  void action.run(async () => {
                    await Clipboard.setStringAsync(invite.token);
                    setInfo('Token copied.');
                  })
                }
              />
              <Button
                secondary
                title="Share invitation"
                onPress={() =>
                  void action.run(async () => {
                    await Share.share({ message });
                  })
                }
              />
            </>
          )}
        </Card>
      ) : (
        <Button
          secondary
          title="Leave circle"
          onPress={() =>
            Alert.alert('Leave ' + circle.name + '?', 'You will need a new invitation to rejoin.', [
              { text: 'Stay', style: 'cancel' },
              {
                text: 'Leave',
                style: 'destructive',
                onPress: () =>
                  void action.run(async () => {
                    await api(path + '/members/me', { method: 'DELETE' });
                    open({ tab: 'Circles' });
                  }),
              },
            ])
          }
        />
      )}
      {info ? <Text style={s.muted}>{info}</Text> : null}
      <Feedback message={action.error} />
    </View>
  );
}
