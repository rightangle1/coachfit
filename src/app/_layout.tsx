import { useCallback, useEffect, useRef, useState } from 'react';
import { router, Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppState, Animated, Image, Pressable, View, type ColorValue } from 'react-native';
import Reanimated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { addUserInteractionListener } from 'expo-widgets';

import { Text, ThemeProvider, useTheme } from '@/design';
import { applyLiveActivityAction } from '@/app-lib/live-activity-actions';
import { initLiveActivityBridge } from '@/features/live-activity-bridge';
import { refreshReminders } from '@/services/reminders';
import { useWorkoutStore } from '@/state/workout-store';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 450, fade: true });

type TabName = 'home' | 'explore' | 'progress' | 'settings';

const LAUNCH_SCENES = [
  require('../../assets/images/launch/yoga-strength.webp'),
  require('../../assets/images/launch/mobility-lunge.webp'),
  require('../../assets/images/launch/front-squat.webp'),
  require('../../assets/images/launch/conditioning-step.webp'),
  require('../../assets/images/launch/dumbbell-press.webp'),
  require('../../assets/images/launch/recovery-stretch.webp'),
] as const;

const LAUNCH_HOLD_MS = 3000;

function CoachFitLaunch({ onComplete }: { onComplete: () => void }) {
  const [scene] = useState(() => Math.floor(Math.random() * LAUNCH_SCENES.length));
  const [opacity] = useState(() => new Animated.Value(1));
  const completed = useRef(false);

  const finish = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    Animated.timing(opacity, { toValue: 0, duration: 320, useNativeDriver: true }).start(onComplete);
  }, [onComplete, opacity]);

  useEffect(() => {
    const timer = setTimeout(finish, LAUNCH_HOLD_MS);
    return () => {
      clearTimeout(timer);
      opacity.stopAnimation();
    };
  }, [finish, opacity]);

  return (
    <Animated.View style={{ ...({ position: 'absolute', inset: 0, zIndex: 100 } as const), opacity }}>
      <Pressable
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel="Skip CoachFit introduction"
        style={{ flex: 1, backgroundColor: '#171922' }}
      >
        <Image
          source={LAUNCH_SCENES[scene]}
          resizeMode="cover"
          style={{ position: 'absolute', width: '100%', height: '100%' }}
        />
        {/* These were two flat rgba slabs, which left a visible horizontal seam
            where each one ended. Gradients fade out instead (ADR-0130). */}
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(8, 12, 10, 0.52)', 'rgba(8, 12, 10, 0)']}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 340 }}
        />
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(8, 12, 10, 0)', 'rgba(8, 12, 10, 0.42)']}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 340 }}
        />
        <SafeAreaView style={{ flex: 1, justifyContent: 'space-between', paddingHorizontal: 28, paddingVertical: 22 }}>
          <View>
            <Text variant="display" color="heroText" weight="bold" style={{ fontSize: 42, lineHeight: 48, letterSpacing: -1.4 }}>
              CoachFit
            </Text>
            <Text variant="label" color="heroMuted" weight="semibold" style={{ marginTop: 4, letterSpacing: 1.2 }}>
              MOVE WITH PURPOSE
            </Text>
          </View>
          <View />
        </SafeAreaView>
      </Pressable>
    </Animated.View>
  );
}

function TabGlyph({ name, color, focused }: { name: TabName; color: ColorValue; focused: boolean }) {
  return (
    <TabGlyphShell focused={focused}>
      <TabGlyphMarks name={name} color={color} focused={focused} />
    </TabGlyphShell>
  );
}

/** Lifts and settles the active tab's glyph so the switch is felt, not just seen. */
function TabGlyphShell({ focused, children }: { focused: boolean; children: React.ReactNode }) {
  const { motion } = useTheme();
  const lift = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    lift.set(motion.enabled ? withSpring(focused ? 1 : 0, motion.spring.snappy) : focused ? 1 : 0);
  }, [focused, lift, motion.enabled, motion.spring.snappy]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + lift.get() * 0.12 }, { translateY: -lift.get() * 2 }],
  }));

  return <Reanimated.View style={style}>{children}</Reanimated.View>;
}

function TabGlyphMarks({ name, color, focused }: { name: TabName; color: ColorValue; focused: boolean }) {
  const shared = { backgroundColor: color, opacity: focused ? 1 : 0.72 };

  if (name === 'home') {
    return (
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
        <View style={[shared, { width: 8, height: 4, borderRadius: 3 }]} />
      </View>
    );
  }
  if (name === 'explore') {
    return (
      <View style={{ width: 24, height: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
        <View style={[shared, { width: 4, height: 14, borderRadius: 2 }]} />
        <View style={[shared, { width: 10, height: 4, borderRadius: 2, opacity: (focused ? 1 : 0.72) * 0.85 }]} />
        <View style={[shared, { width: 4, height: 14, borderRadius: 2 }]} />
      </View>
    );
  }
  if (name === 'progress') {
    return (
      <View style={{ width: 24, height: 24, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 3 }}>
        <View style={[shared, { width: 4, height: 8, borderRadius: 3 }]} />
        <View style={[shared, { width: 4, height: 14, borderRadius: 3 }]} />
        <View style={[shared, { width: 4, height: 19, borderRadius: 3 }]} />
      </View>
    );
  }
  return (
    <View style={{ width: 24, height: 24, justifyContent: 'center', gap: 5 }}>
      {[7, 15, 10].map((offset, i) => (
        <View key={i} style={{ height: 2, borderRadius: 1, backgroundColor: color, opacity: (focused ? 1 : 0.72) * 0.4, width: 24 }}>
          <View style={[shared, { position: 'absolute', top: -3, left: offset, width: 8, height: 8, borderRadius: 4 }]} />
        </View>
      ))}
    </View>
  );
}

function ThemedStack() {
  const { colors, scheme, shadows } = useTheme();
  const [showLaunch, setShowLaunch] = useState(true);
  // Liquid glass exists only on iOS 26+. Everywhere else — Android, web, older
  // iOS — the tab bar keeps its solid surface, so this is purely additive
  // (ADR-0130).
  const glass = isLiquidGlassAvailable();
  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  return (
    <>
      <StatusBar style={showLaunch || scheme === 'dark' ? 'light' : 'dark'} />
      <Tabs
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: colors.bg },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarBackground: glass
            ? () => (
                <GlassView
                  glassEffectStyle="regular"
                  colorScheme={scheme}
                  style={{ position: 'absolute', inset: 0 }}
                />
              )
            : undefined,
          tabBarStyle: {
            backgroundColor: glass ? 'transparent' : colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            height: 76,
            paddingTop: 8,
            paddingBottom: 9,
            // The tab bar floats over content, so it reads the `lg` tier —
            // inverted vertically, since its shadow falls upward (ADR-0130).
            ...shadows.sm,
            shadowOffset: { width: 0, height: -shadows.sm.shadowOffset.height },
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
          tabBarItemStyle: { borderRadius: 12, marginVertical: 3, marginHorizontal: 3 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
          title: 'Today',
            tabBarIcon: ({ color, focused }) => <TabGlyph name="home" color={color} focused={focused} />,
          }}
          listeners={{
            tabPress: (e) => {
              const record = useWorkoutStore.getState().record;
              if (record != null && record.completedAt == null) {
                e.preventDefault();
                router.push('/workout');
              }
            },
          }}
        />
        <Tabs.Screen
          name="explore"
          options={{
            title: 'Explore',
            tabBarIcon: ({ color, focused }) => <TabGlyph name="explore" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="progress"
          options={{
            title: 'Progress',
            tabBarIcon: ({ color, focused }) => <TabGlyph name="progress" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => <TabGlyph name="settings" color={color} focused={focused} />,
          }}
        />
        <Tabs.Screen name="workout" options={{ href: null }} />
        {['onboarding', 'equipment', 'debrief', 'tour', 'exercise', 'workout-flow', 'dev-seed'].map((name) => (
          <Tabs.Screen key={name} name={name} options={{ href: null, tabBarStyle: { display: 'none' } }} />
        ))}
      </Tabs>
      {showLaunch ? <CoachFitLaunch onComplete={() => setShowLaunch(false)} /> : null}
    </>
  );
}

export default function RootLayout() {
  // Wires the iOS Live Activity to the workout store's live state, and routes
  // its button taps back into the same store mutations the tracker UI uses.
  // Both no-op on Android/web (the port and the native module are stubs there).
  useEffect(() => {
    const unsubscribeBridge = initLiveActivityBridge();
    // `event.source` is the Live Activity's per-instance activityID (a UUID
    // ActivityKit assigns), not the name passed to `createLiveActivity` — it
    // identifies which *instance* fired, not which *kind* of activity. This
    // app only ever runs one Live Activity (the workout) at a time, so any
    // interaction event unambiguously belongs to it; no source check needed.
    const subscription = addUserInteractionListener((event) => {
      applyLiveActivityAction(event.target, useWorkoutStore.getState());
    });
    return () => {
      unsubscribeBridge();
      subscription.remove();
    };
  }, []);

  // Re-derives which local reminders should be pending on every foreground —
  // there's no background task, so this (plus the post-debrief refresh) is
  // what keeps them current (ADR-0403). No-ops on web/unsupported platforms.
  useEffect(() => {
    void refreshReminders();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshReminders();
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStack />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
