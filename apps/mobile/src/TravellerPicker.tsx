import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { Field, s } from './ui';

export type Traveller = { kind: 'self' } | { kind: 'guest'; name: string; permission: boolean };

export function TravellerPicker({ value, disabled, onChange }: {
  value: Traveller;
  disabled: boolean;
  onChange: (value: Traveller) => void;
}) {
  return (
    <>
      <Text style={s.heading}>Who’s travelling?</Text>
      <View accessibilityRole="radiogroup" style={s.row}>
        {(['self', 'guest'] as const).map((kind) => {
          const selected = value.kind === kind;
          const label = kind === 'self' ? 'Me' : 'Someone else';
          return (
            <Pressable
              key={kind}
              accessibilityRole="radio"
              accessibilityLabel={label}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              style={[s.button, !selected && s.secondary]}
              onPress={() => {
                if (!selected) onChange(kind === 'self' ? { kind } : { kind, name: '', permission: false });
              }}
            >
              <Text style={[s.btnText, !selected && s.body]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {value.kind === 'guest' && (
        <>
          <Field
            label="Traveller’s name"
            value={value.name}
            maxLength={60}
            editable={!disabled}
            autoCapitalize="words"
            onChangeText={(name) => onChange({ ...value, name, permission: false })}
          />
          <Text style={s.muted}>You manage payment, messages and cancellation. The driver sees this name.</Text>
          <View style={s.row}>
            <Switch
              accessibilityLabel="Traveller gave permission"
              disabled={disabled}
              value={value.permission}
              onValueChange={(permission) => onChange({ ...value, permission })}
            />
            <Text style={[s.body, { flex: 1 }]}>They asked me to book and share their name.</Text>
          </View>
        </>
      )}
    </>
  );
}
