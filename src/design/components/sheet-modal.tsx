/**
 * SheetModal — the app's one popup pattern. Slides up from the bottom over a
 * dimmed backdrop, tap-outside or the × to dismiss. Used for every
 * "view info, then leave" popup (achievements, recovery, workout detail,
 * exercise catalog, in-workout how-to / replace) so they all look and behave
 * the same way, per CLAUDE.md's UX-for-the-fatigued-user principle.
 *
 * ADR-0130 moved it off the OS `animationType="slide"` onto Reanimated so it
 * can also be dragged down to dismiss — the gesture a fatigued user reaches for
 * first, and the one this sheet did not previously support. The grabber makes
 * that affordance visible.
 */

import { useEffect } from 'react';
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { timing } from '../motion';
import { useTheme } from '../theme';
import { Row } from './layout';
import { IconButton } from './button';
import { Icon } from './icon';
import { Text } from './text';

/** Drag far enough (or fling hard enough) and the sheet closes. */
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 800;

export function SheetModal({
  visible,
  onClose,
  eyebrow,
  title,
  closeLabel,
  stickyTop,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  closeLabel: string;
  /** Rendered between the title and the scrollable body, outside the
   * ScrollView — stays pinned in place while `children` scrolls underneath
   * (e.g. a search box + filter chips that should never scroll out of reach). */
  stickyTop?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, spacing, radii, shadows, motion } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const translateY = useSharedValue(screenHeight);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.set(motion.enabled ? withSpring(0, motion.spring.gentle) : 0);
      backdrop.set(withTiming(1, timing(motion.enabled, motion.duration.base)));
    } else {
      translateY.set(screenHeight);
      backdrop.set(0);
    }
  }, [visible, translateY, backdrop, screenHeight, motion.enabled, motion.duration.base, motion.spring.gentle]);

  const close = () => {
    translateY.set(
      withTiming(screenHeight, timing(motion.enabled, motion.duration.slow, 'accelerate'), () => {
        runOnJS(onClose)();
      }),
    );
    backdrop.set(withTiming(0, timing(motion.enabled, motion.duration.fast)));
  };

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .onChange((event) => {
      // Downward only: dragging up must not lift the sheet off its anchor.
      translateY.set(Math.max(0, translateY.get() + event.changeY));
    })
    .onEnd((event) => {
      if (translateY.get() > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        translateY.set(
          withTiming(screenHeight, { duration: motion.duration.slow }, () => {
            runOnJS(onClose)();
          }),
        );
        backdrop.set(withTiming(0, { duration: motion.duration.fast }));
      } else {
        translateY.set(withSpring(0, motion.spring.gentle));
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.get() }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.get() }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Animated.View style={[{ position: 'absolute', inset: 0, backgroundColor: colors.overlay }, backdropStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={closeLabel} onPress={close} style={{ flex: 1 }} />
        </Animated.View>
        <GestureDetector gesture={pan}>
          <Animated.View
            style={[
              {
                maxHeight: '88%',
                paddingTop: spacing.sm,
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.xxl,
                borderTopRightRadius: radii.xxl,
                borderTopWidth: 1,
                borderColor: colors.border,
              },
              shadows.lg,
              sheetStyle,
            ]}
          >
            <View
              accessibilityElementsHidden
              style={{
                alignSelf: 'center',
                width: 40,
                height: 4,
                borderRadius: radii.pill,
                backgroundColor: colors.borderStrong,
                marginBottom: spacing.sm,
              }}
            />
            <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md }}>
              <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text variant="caption" color="primaryTextSoft" weight="bold">
                    {eyebrow}
                  </Text>
                  <Text variant="title" italic>{title}</Text>
                </View>
                <IconButton
                  label={closeLabel}
                  onPress={close}
                  icon={<Icon name="close" size={18} color="textMuted" />}
                />
              </Row>
            </View>
            {stickyTop && (
              <View style={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.lg }}>
                {stickyTop}
              </View>
            )}
            <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, gap: spacing.lg }}>
              {children}
            </ScrollView>
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}
