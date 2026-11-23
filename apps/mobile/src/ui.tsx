import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

export const color = {
  navy: '#14213D',
  blue: '#2457D6',
  cloud: '#F4F7FF',
  white: '#FFFFFF',
  ink: '#182843',
  muted: '#495B76',
  line: '#CDDAF0',
  danger: '#973241',
};
export const s = StyleSheet.create({
  screen: { gap: 16, paddingBottom: 14 },
  card: {
    backgroundColor: color.white,
    borderColor: color.line,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  title: { fontSize: 32, fontWeight: '800', color: color.navy, letterSpacing: -1 },
  heading: { fontSize: 19, fontWeight: '700', color: color.ink },
  body: { fontSize: 16, lineHeight: 23, color: color.ink },
  muted: { fontSize: 14, lineHeight: 21, color: color.muted },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  input: {
    borderColor: '#94A8C8',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    minHeight: 48,
    paddingVertical: 10,
    color: color.ink,
    backgroundColor: '#FFF',
    fontSize: 16,
  },
  button: {
    borderRadius: 12,
    paddingHorizontal: 16,
    minHeight: 46,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.blue,
  },
  secondary: { backgroundColor: '#E8EEFC' },
  disabled: { opacity: 0.55 },
  btnText: { fontSize: 15, fontWeight: '700', color: color.white },
  error: { fontSize: 14, color: color.danger, lineHeight: 21 },
});
export function Button({
  title,
  onPress,
  secondary = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.button, secondary && s.secondary, (pressed || disabled) && s.disabled]}
    >
      <Text style={[s.btnText, secondary && { color: color.blue }]}>{title}</Text>
    </Pressable>
  );
}
export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={s.title}>
      {children}
    </Text>
  );
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 5 }}>
      <Text style={s.muted}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor="#64748B"
        {...props}
        style={[s.input, props.multiline && { minHeight: 78, textAlignVertical: 'top' }, props.style]}
      />
    </View>
  );
}
export function Feedback({ message }: { message?: string }) {
  return message ? (
    <Text accessibilityRole="alert" style={s.error}>
      {message}
    </Text>
  ) : null;
}
export function LoadState({
  loading,
  error,
  refresh,
}: {
  loading: boolean;
  error: string;
  refresh: () => void;
}) {
  return (
    <>
      {loading && <ActivityIndicator accessibilityLabel="Loading" color={color.blue} />}
      {error ? (
        <>
          <Feedback message={error} />
          <Button secondary title="Try again" onPress={refresh} />
        </>
      ) : null}
    </>
  );
}
