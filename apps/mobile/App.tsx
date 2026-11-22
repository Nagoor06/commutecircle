import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { createClient } from './src/api';
import { Mobile } from './src/context';
import { session } from './src/session';
import { Route, Tab } from './src/types';
import { color, Feedback, s } from './src/ui';
import { Unread } from './src/Unread';
import { Book } from './src/screens/Book';
import { Ride, Trips } from './src/screens/Ride';
import { Account, SignIn } from './src/screens/Account';
import { CircleDetail, Circles } from './src/screens/Circles';
import { Conversation, Inbox } from './src/screens/Inbox';
import { Offer } from './src/screens/Offer';
import { Safety } from './src/screens/Safety';

const tabs: Tab[] = ['Book', 'Offer', 'Trips', 'Circles', 'Inbox', 'Profile'];
const reasons = {
  Offer: 'Sign in to offer a ride with your approved vehicle.',
  Trips: 'Sign in to see your rides and reservations.',
  Circles: 'Sign in to create a circle or join with an invitation.',
  Inbox: 'Sign in to open private booking conversations.',
  Profile: 'Sign in to manage your commuter profile.',
};
const publicClient = createClient(session.token, session.reject);
function Screen({ route, signed }: { route: Route; signed: boolean }) {
  if ('screen' in route) {
    if (route.screen === 'ride') return <Ride {...route} />;
    if (!signed) return <SignIn title="Sign in" reason="Sign in to return to this booking." />;
    if (route.screen === 'chat') return <Conversation {...route} />;
    if (route.screen === 'circle') return <CircleDetail {...route} />;
    return <Safety {...route} />;
  }
  if (route.tab === 'Book') return <Book />;
  if (!signed)
    return <SignIn title={route.tab === 'Trips' ? 'My trips' : route.tab} reason={reasons[route.tab]} />;
  switch (route.tab) {
    case 'Offer':
      return <Offer />;
    case 'Trips':
      return <Trips />;
    case 'Inbox':
      return <Inbox />;
    case 'Circles':
      return <Circles />;
    case 'Profile':
      return <Account />;
  }
}
function Shell() {
  const state = useSyncExternalStore(session.subscribe, session.snapshot);
  const [stack, setStack] = useState<Route[]>([{ tab: 'Book' }]),
    [count, setCount] = useState(0),
    [error, setError] = useState('');
  const previous = useRef(state.signed),
    scroll = useRef<ScrollView>(null);
  const open = useCallback(
    (route: Route) => {
      if (session.snapshot().accountGeneration !== state.accountGeneration) return;
      setStack((previous) => ('tab' in route ? [route] : [...previous, route]));
    },
    [state.accountGeneration],
  );
  const back = useCallback(() => {
    if (stack.length > 1) {
      setStack((prev) => prev.slice(0, -1));
      return true;
    }
    if (!('tab' in stack[0]) || stack[0].tab !== 'Book') {
      setStack([{ tab: 'Book' }]);
      return true;
    }
    return false;
  }, [stack]);
  useEffect(() => {
    const h = BackHandler.addEventListener('hardwareBackPress', back);
    return () => h.remove();
  }, [back]);
  useEffect(() => {
    void session.load();
    const listen = Linking.addEventListener('url', (e) => {
      void session.accept(e.url);
    });
    void Linking.getInitialURL()
      .then((url) => {
        if (url) void session.accept(url);
      })
      .catch(() => {});
    return () => listen.remove();
  }, []);
  useEffect(() => {
    if (previous.current && !state.signed) {
      setStack([{ tab: 'Book' }]);
      setCount(0);
    }
    previous.current = state.signed;
  }, [state.signed]);
  const route = stack[stack.length - 1],
    tab = 'tab' in stack[0] ? stack[0].tab : 'Book';
  const pageKey = JSON.stringify(route) + state.accountGeneration;
  useEffect(() => scroll.current?.scrollTo({ y: 0, animated: false }), [pageKey]);
  return (
    <Mobile.Provider
      value={{
        api: publicClient,
        signed: state.signed,
        ready: state.ready,
        signingIn: state.busy,
        login: () => void session.signIn(),
        logout: () =>
          void session
            .signOut()
            .catch(() => setError('Could not clear saved credentials. Try signing out again.')),
        open,
      }}
    >
      <SafeAreaView style={styles.shell}>
        <StatusBar barStyle="light-content" />
        <View style={styles.header}>
          {stack.length > 1 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={back}
              style={styles.back}
            >
              <Text style={styles.brand}>‹</Text>
            </Pressable>
          )}
          <Text style={styles.brand}>CommuteCircle</Text>
        </View>
        {!!(state.message || error) && (
          <View style={s.card}>
            <Feedback message={state.message || error} />
          </View>
        )}
        {state.signed && (
          <Unread
            key={state.accountGeneration}
            chat={'screen' in route && route.screen === 'chat' ? route.ticket : undefined}
            onCount={setCount}
          />
        )}
        <ScrollView
          ref={scroll}
          style={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.page}
        >
          <Screen key={pageKey} route={route} signed={state.signed} />
        </ScrollView>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {tabs.map((name) => (
            <Pressable
              key={name}
              accessibilityRole="tab"
              accessibilityState={{ selected: name === tab }}
              accessibilityLabel={name === 'Inbox' && count ? 'Inbox, ' + count + ' unread' : name}
              onPress={() => open({ tab: name })}
              style={({ pressed }) => [
                styles.tab,
                name === tab && styles.selected,
                pressed && { opacity: 0.65 },
              ]}
            >
              <Text style={[styles.tabText, name === tab && { color: color.blue }]}>
                {name}
                {name === 'Inbox' && count ? ' ' + (count > 99 ? '99+' : count) : ''}
              </Text>
            </Pressable>
          ))}
        </View>
      </SafeAreaView>
    </Mobile.Provider>
  );
}
export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: color.navy },
  header: {
    backgroundColor: color.navy,
    minHeight: 52,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  brand: { color: '#FFF', fontWeight: '800', fontSize: 23, letterSpacing: -0.7 },
  back: { minWidth: 40, minHeight: 44, justifyContent: 'center' },
  scroll: { backgroundColor: color.cloud, flex: 1 },
  page: {
    paddingHorizontal: 18,
    paddingVertical: 22,
    maxWidth: 740,
    width: '100%',
    alignSelf: 'center',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderColor: color.line,
    justifyContent: 'center',
    padding: 3,
  },
  tab: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 3,
    borderRadius: 10,
  },
  selected: { backgroundColor: '#E6EDFF' },
  tabText: { fontWeight: '700', fontSize: 13, color: color.muted },
});
