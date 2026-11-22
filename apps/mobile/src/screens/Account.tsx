import React, { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { useMobile } from '../context';
import { useAction, useResource } from '../hooks';
import { Button, Card, Field, Feedback, Heading, LoadState, s } from '../ui';
import { Verification } from './Verification';
import { Eligibility, WEB } from '../types';
export function SignIn({ title, reason }: { title: string; reason: string }) {
  const { login, signingIn, ready } = useMobile();
  return (
    <View style={s.screen}>
      <Heading>{title}</Heading>
      <Card>
        <Text style={s.body}>{reason}</Text>
        <Button
          title={signingIn ? 'Opening sign-in…' : 'Sign in'}
          disabled={!ready || signingIn}
          onPress={login}
        />
      </Card>
    </View>
  );
}
export function WebLink({ route, title }: { route: string; title: string }) {
  const action = useAction();
  return (
    <>
      <Button
        title={title}
        secondary
        onPress={() => void action.run(() => Linking.openURL(WEB + '#/' + route))}
      />
      <Feedback message={action.error} />
    </>
  );
}
export function Account() {
  const { api, logout } = useMobile();
  const load = useCallback(
    async (signal: AbortSignal) => {
      const [profile, eligibility] = await Promise.all([
        api<{ display_name: string | null }>('/v1/me/profile', { signal }),
        api<Eligibility>('/v1/me/driver-eligibility', { signal }),
      ]);
      return { profile, eligibility };
    },
    [api],
  );
  const result = useResource(load);
  const [name, setName] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');
  const action = useAction();
  return (
    <View style={s.screen}>
      <Heading>Profile</Heading>
      <LoadState {...result} />
      {result.data && (
        <>
          <Card>
            <Field
              label="Display name"
              value={name ?? result.data.profile.display_name ?? ''}
              onChangeText={setName}
              maxLength={80}
            />
            <Button
              title="Save name"
              disabled={action.busy || !name || name.trim().length < 2}
              onPress={() =>
                void action.run(async () => {
                  await api('/v1/me/profile', { method: 'PUT', body: { display_name: name?.trim() } });
                  setFeedback('Name saved.');
                  result.refresh();
                })
              }
            />
            <Feedback message={action.error} />
            {feedback ? <Text style={s.muted}>{feedback}</Text> : null}
          </Card>
          <Verification eligibility={result.data.eligibility} refresh={result.refresh} />
        </>
      )}
      <WebLink title="Browser notification settings" route="profile" />
      <WebLink title="Rider guide" route="help" />
      <Button secondary title="Sign out" onPress={logout} />
    </View>
  );
}
