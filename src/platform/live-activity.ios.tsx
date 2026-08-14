/**
 * Real Live Activity port — iOS only. Renders via `expo-widgets`' React-authored
 * Live Activity API (no custom Xcode target, no SwiftUI to hand-write).
 *
 * The function passed to `createLiveActivity` below carries the `'widget'`
 * directive (like `'use strict'`). `babel-preset-expo`'s widgets-plugin
 * detects that directive and replaces the *entire function* with a stringified
 * copy of its own source, which the native side re-evaluates later in an
 * isolated sandbox — so it cannot close over anything from this module (no
 * helper functions, no imports beyond the JSX components themselves, which
 * the sandbox provides as matching globals). Everything the layout needs must
 * already be plain data on `content` — see `LiveWorkoutActivityContent`.
 *
 * Timers (rest countdown, elapsed workout time) bind to static dates so the
 * OS renders them without repeated `update()` calls, matching how Now
 * Playing / Timers keep counting while the app is backgrounded.
 *
 * Icon: an SF Symbol, not the app's raster icon. The widget extension runs in
 * its own sandboxed process and can't read the main app bundle's assets
 * directly — an earlier version worked around that by copying the icon into
 * `expo-widgets`' shared app-group `widgetsDirectory` on first launch, but
 * that copy is a real async file operation racing the very first Live
 * Activity render, and shows up as a blank placeholder square whenever it
 * loses. A system symbol has no such race (it's baked into the OS, not
 * fetched), so it's the more reliable choice here, not just the simpler one.
 */

import { Button, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  font,
  foregroundStyle,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivity } from 'expo-widgets';

import {
  WORKOUT_LIVE_ACTIVITY_NAME,
  type LiveActivityPort,
  type LiveWorkoutActivityContent,
} from './live-activity-types';

// The factory callback below is stringified and re-evaluated in an isolated
// native sandbox (see the file header) — it cannot close over module-level
// constants, so every color literal is repeated inline rather than pulled
// from a shared constant here.
const factory = createLiveActivity<LiveWorkoutActivityContent>(WORKOUT_LIVE_ACTIVITY_NAME, (content) => {
  'widget';
  const restEndsAt = content.restEndsAt;
  const icon = <Image systemName="dumbbell.fill" size={16} color="#345C47" />;
  // The Live Activity runs in its own isolated SwiftUI sandbox, so these
  // literals intentionally mirror the in-app Editorial Athlete controls
  // rather than importing the JS theme tokens. One evergreen action owns the
  // moment; the rest step back into quiet navigation or warm-neutral support.
  const navButtons = (
    <HStack spacing={16}>
      <Button
        label="Previous"
        systemImage="chevron.left"
        target="prev_exercise"
        modifiers={[buttonStyle('bordered'), buttonBorderShape('circle'), controlSize('small'), tint('#345C47')]}
      />
      <Button
        label="Next"
        systemImage="chevron.right"
        target="next_exercise"
        modifiers={[buttonStyle('bordered'), buttonBorderShape('circle'), controlSize('small'), tint('#345C47')]}
      />
    </HStack>
  );
  const logButtons = (
    <HStack spacing={10}>
      <Button
        label="Log set"
        systemImage="checkmark"
        target="log_set"
        modifiers={[
          buttonStyle('borderedProminent'),
          buttonBorderShape('roundedRectangle', 12),
          controlSize('regular'),
          tint('#345C47'),
        ]}
      />
      <Button
        label="Log all"
        systemImage="checkmark.circle"
        target="log_all_sets"
        modifiers={[
          buttonStyle('bordered'),
          buttonBorderShape('roundedRectangle', 12),
          controlSize('regular'),
          tint('#345C47'),
        ]}
      />
    </HStack>
  );
  const actionRow = (
    <HStack spacing={14}>
      {navButtons}
      {logButtons}
    </HStack>
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={10}>
        <HStack spacing={8}>
          {icon}
          <Text modifiers={[font({ size: 16, weight: 'semibold' })]}>{content.exerciseName}</Text>
        </HStack>
        <HStack spacing={8}>
          <Text modifiers={[foregroundStyle('#5C6B62')]}>{content.setLabel}</Text>
          {restEndsAt != null ? (
            <Text timerInterval={{ lower: new Date(), upper: new Date(restEndsAt) }} countsDown modifiers={[foregroundStyle('#345C47')]} />
          ) : null}
        </HStack>
        {actionRow}
      </VStack>
    ),
    compactLeading: <Text date={new Date(content.sessionStartedAt)} dateStyle="timer" />,
    compactTrailing: <Text>{content.setsSummaryCompact}</Text>,
    minimal: <Text>{content.setsRemainingLabel}</Text>,
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        <HStack spacing={8}>
          {icon}
          <Text modifiers={[font({ size: 16, weight: 'semibold' })]}>{content.exerciseName}</Text>
        </HStack>
        <Text modifiers={[foregroundStyle('#5C6B62')]}>{content.setLabel}</Text>
      </VStack>
    ),
    expandedTrailing:
      restEndsAt != null ? (
        <Text timerInterval={{ lower: new Date(), upper: new Date(restEndsAt) }} countsDown modifiers={[foregroundStyle('#345C47')]} />
      ) : undefined,
    expandedBottom: (
      <VStack alignment="leading" spacing={10}>
        <HStack spacing={8}>
          <Text date={new Date(content.sessionStartedAt)} dateStyle="timer" />
          <Text modifiers={[foregroundStyle('#5C6B62')]}>{content.setsSummaryExpanded}</Text>
        </HStack>
        {actionRow}
      </VStack>
    ),
  };
});

let activeInstance: LiveActivity<LiveWorkoutActivityContent> | null = null;

function start(content: LiveWorkoutActivityContent): void {
  const existing = factory.getInstances()[0];
  if (existing) {
    activeInstance = existing;
    void existing.update(content);
    return;
  }
  activeInstance = factory.start(content);
}

function update(content: LiveWorkoutActivityContent): void {
  if (!activeInstance) {
    start(content);
    return;
  }
  void activeInstance.update(content);
}

function end(finalContent?: LiveWorkoutActivityContent): void {
  if (!activeInstance) return;
  void activeInstance.end('default', finalContent);
  activeInstance = null;
}

export const liveActivityPort: LiveActivityPort = {
  isSupported: () => true,
  start,
  update,
  end,
};
