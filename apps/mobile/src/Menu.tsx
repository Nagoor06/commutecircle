import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Tab } from './types';
import { Button, color, s } from './ui';

const groups = [
  { title: 'Ride planning', items: [
    { tab: 'Offer', label: 'Offer a ride', icon: require('../assets/tabs/car.png') },
    { tab: 'Recurring', label: 'Recurring rides', icon: require('../assets/tabs/ticket.png') },
  ] },
  { title: 'Community & account', items: [
    { tab: 'Circles', label: 'Private circles', icon: require('../assets/tabs/users.png') },
    { tab: 'Profile', label: 'Profile & verification', icon: require('../assets/tabs/user.png') },
  ] },
] as const;

export function Menu({ active, close, navigate }: { active: Tab; close: () => void; navigate: (tab: Tab) => void }) {
  return <Modal transparent visible animationType="fade" onRequestClose={close}>
    <View style={css.overlay}>
      <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={close} />
      <SafeAreaView style={css.drawer}>
        <View style={css.top}><Text accessibilityRole="header" style={s.heading}>Menu</Text>
          <Button secondary title="Close menu" onPress={close} /></View>
        <ScrollView contentContainerStyle={css.groups}>
          {groups.map((group) => <View key={group.title} style={css.group}>
            <Text style={css.groupTitle}>{group.title}</Text>
            {group.items.map(({ tab, label, icon }) => <Pressable accessibilityRole="button" key={tab}
              accessibilityLabel={label} accessibilityState={{ selected: active === tab }} onPress={() => navigate(tab)}
              style={({ pressed }) => [css.item, (pressed || active === tab) && css.active]}>
              <Image accessible={false} source={icon} style={css.icon} /><Text style={css.label}>{label}</Text>
            </Pressable>)}
          </View>)}
        </ScrollView>
      </SafeAreaView>
    </View>
  </Modal>;
}

const css = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0e193978', alignItems: 'flex-end' },
  drawer: { flex: 1, width: '87%', maxWidth: 360, backgroundColor: color.white, paddingHorizontal: 18 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  groups: { paddingBottom: 22, gap: 22 }, group: { gap: 4 },
  groupTitle: { color: color.muted, fontWeight: '700', fontSize: 14, marginVertical: 6 },
  item: { borderRadius: 12, flexDirection: 'row', gap: 12, minHeight: 52, padding: 12, alignItems: 'center' },
  active: { backgroundColor: '#e9efff' }, icon: { width: 24, height: 24, tintColor: color.blue },
  label: { ...s.body, flex: 1, fontWeight: '600' },
});
