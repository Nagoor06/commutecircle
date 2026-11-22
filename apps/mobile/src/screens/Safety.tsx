import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useMobile } from '../context';
import { useAction } from '../hooks';
import { Button, Card, Field, Feedback, Heading, s } from '../ui';
const categories = {
  unsafe_driving: 'Unsafe driving',
  vehicle_mismatch: 'Vehicle mismatch',
  harassment: 'Harassment',
  pickup_issue: 'Pickup issue',
  other: 'Other',
};
export function Safety({ journey, ticket }: { journey: string; ticket?: string }) {
  const { api } = useMobile(),
    action = useAction();
  const [category, setCategory] = useState('unsafe_driving'),
    [description, setDescription] = useState(''),
    [sent, setSent] = useState(false);
  return (
    <View style={s.screen}>
      <Heading>Safety report</Heading>
      <Card>
        {sent ? (
          <Text style={s.body}>Your confidential report was submitted for review.</Text>
        ) : (
          <>
            <Text style={s.muted}>
              Only you and authorized reviewers can see your report. For immediate danger, contact local
              emergency services.
            </Text>
            {Object.entries(categories).map(([id, title]) => (
              <Button
                key={id}
                secondary
                title={(category === id ? '✓ ' : '') + title}
                onPress={() => setCategory(id)}
              />
            ))}
            <Field
              label="What happened?"
              multiline
              maxLength={1500}
              value={description}
              onChangeText={setDescription}
            />
            <Button
              title="Submit confidential report"
              disabled={action.busy || description.trim().length < 10}
              onPress={() =>
                void action.run(async () => {
                  await api('/v1/safety-reports', {
                    method: 'POST',
                    body: {
                      journey_id: journey,
                      ...(ticket ? { ticket_id: ticket } : {}),
                      category,
                      description: description.trim(),
                    },
                  });
                  setSent(true);
                  setDescription('');
                })
              }
            />
            <Feedback message={action.error} />
          </>
        )}
      </Card>
    </View>
  );
}
