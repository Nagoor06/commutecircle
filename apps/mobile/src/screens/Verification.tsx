import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMobile } from '../context';
import { useAction } from '../hooks';
import { Eligibility } from '../types';
import { Button, Card, Feedback, Field, s } from '../ui';

export function Verification({
  eligibility,
  refresh,
}: {
  eligibility: Eligibility;
  refresh: () => void;
}) {
  const { api } = useMobile(),
    action = useAction();
  const [evidence, setEvidence] = useState(''),
    [adding, setAdding] = useState(false),
    [notice, setNotice] = useState('');
  const blank = { make: '', model: '', color: '', registration: '', seats: '' };
  const [vehicle, setVehicle] = useState(blank);
  const fields = {
    make: 'Make',
    model: 'Model',
    color: 'Colour',
    registration: 'Registration',
    seats: 'Passenger seats',
  };
  const status = eligibility.driver_status;
  const validVehicle =
    vehicle.make.trim() &&
    vehicle.model.trim() &&
    vehicle.color.trim() &&
    vehicle.registration.trim().length >= 5 &&
    /^[1-8]$/.test(vehicle.seats);
  return (
    <Card>
      <Text style={s.heading}>Driver and vehicle verification</Text>
      <Text style={s.body}>Driver · {status}</Text>
      {(status === 'unverified' || status === 'rejected') && (
        <>
          <Field
            label="Verification reference"
            value={evidence}
            maxLength={128}
            autoCapitalize="none"
            onChangeText={setEvidence}
          />
          <Text style={s.muted}>
            Use the reference from your verification provider. Keep identity documents out of this field.
          </Text>
          <Button
            secondary
            title="Submit driver application"
            disabled={action.busy || evidence.trim().length < 6}
            onPress={() =>
              void action.run(async () => {
                await api('/v1/me/driver-verification', {
                  method: 'POST',
                  body: { evidence_reference: evidence.trim() },
                });
                setEvidence('');
                setNotice('Driver application submitted for review.');
                refresh();
              })
            }
          />
        </>
      )}
      {eligibility.vehicles.map((v) => (
        <Text key={v.id} style={s.body}>
          {v.color} {v.make} {v.model} · {v.status}
        </Text>
      ))}
      {!adding ? (
        <Button secondary title="Add vehicle for review" onPress={() => setAdding(true)} />
      ) : (
        <View style={{ gap: 8 }}>
          {(Object.keys(fields) as (keyof typeof fields)[]).map((key) => (
            <Field
              key={key}
              label={fields[key]}
              value={vehicle[key]}
              editable={!action.busy}
              maxLength={{ make: 60, model: 60, color: 40, registration: 24, seats: 1 }[key]}
              keyboardType={key === 'seats' ? 'number-pad' : 'default'}
              onChangeText={(value) => setVehicle((old) => ({ ...old, [key]: value }))}
            />
          ))}
          <Button
            title="Submit vehicle"
            disabled={!validVehicle || action.busy}
            onPress={() =>
              void action.run(async () => {
                await api('/v1/me/vehicles', {
                  method: 'POST',
                  body: {
                    make: vehicle.make.trim(),
                    model: vehicle.model.trim(),
                    color: vehicle.color.trim(),
                    registration: vehicle.registration.trim(),
                    seat_capacity: Number(vehicle.seats),
                  },
                });
                setAdding(false);
                setVehicle(blank);
                setNotice('Vehicle submitted for review.');
                refresh();
              })
            }
          />
          <Button title="Cancel" secondary disabled={action.busy} onPress={() => setAdding(false)} />
        </View>
      )}
      {notice ? <Text style={s.muted}>{notice}</Text> : null}
      <Feedback message={action.error} />
    </Card>
  );
}
