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
 * App icon: the widget extension runs in its own sandboxed process, so it
 * can't read the main app bundle's assets directly. `expo-widgets`' shared
 * `widgetsDirectory` (an app-group container both processes can read) is the
 * sanctioned way around that — `ensureAppIconUri` copies the icon there once
 * on first app launch and the resulting `file://` URI is threaded through as
 * plain data on `content`, same as everything else the sandboxed layout uses.
 */

import { Button, HStack, Image, Text, VStack } from '@expo/ui/swift-ui';
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  cornerRadius,
  frame,
  resizable,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import { createLiveActivity, widgetsDirectory, type LiveActivity } from 'expo-widgets';

import {
  WORKOUT_LIVE_ACTIVITY_NAME,
  type LiveActivityPort,
  type LiveWorkoutActivityContent,
} from './live-activity-types';

const APP_ICON_MODULE = require('../../assets/images/coachfit-icon-option-2-barbell.png');

let cachedAppIconUri: string | null = null;

async function ensureAppIconUri(): Promise<string | null> {
  if (!widgetsDirectory) return null;
  const destination = new File(widgetsDirectory, 'app-icon.png');
  if (destination.exists) return destination.uri;

  const asset = Asset.fromModule(APP_ICON_MODULE);
  await asset.downloadAsync();
  if (!asset.localUri) return null;

  new File(asset.localUri).copySync(destination);
  return destination.exists ? destination.uri : null;
}

void ensureAppIconUri().then((uri) => {
  cachedAppIconUri = uri;
});

const factory = createLiveActivity<LiveWorkoutActivityContent>(WORKOUT_LIVE_ACTIVITY_NAME, (content) => {
  'widget';
  const restEndsAt = content.restEndsAt;
  const appIcon =
    content.appIconUri != null ? (
      <Image uiImage={content.appIconUri} modifiers={[resizable(), frame({ width: 18, height: 18 }), cornerRadius(4)]} />
    ) : null;
  // The Live Activity runs in its own isolated SwiftUI sandbox, so these
  // literals intentionally mirror the in-app Editorial Athlete controls
  // rather than importing the JS theme tokens. One evergreen action owns the
  // moment; the rest step back into quiet navigation or warm-neutral support.
  const actionButtons = (
    <VStack alignment="leading" spacing={4}>
      <HStack spacing={8}>
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
      <HStack spacing={12}>
        <Button
          label="Previous"
          systemImage="chevron.left"
          target="prev_exercise"
          modifiers={[buttonStyle('borderless'), controlSize('small'), tint('#345C47')]}
        />
        <Button
          label="Next"
          systemImage="chevron.right"
          target="next_exercise"
          modifiers={[buttonStyle('borderless'), controlSize('small'), tint('#345C47')]}
        />
      </HStack>
    </VStack>
  );
  return {
    banner: (
      <VStack alignment="leading" spacing={6}>
        <HStack spacing={6}>
          {appIcon}
          <Text>{content.exerciseName}</Text>
        </HStack>
        <Text>{content.setLabel}</Text>
        {restEndsAt != null ? (
          <Text timerInterval={{ lower: new Date(), upper: new Date(restEndsAt) }} countsDown />
        ) : null}
        {actionButtons}
      </VStack>
    ),
    compactLeading: appIcon ?? <Text date={new Date(content.sessionStartedAt)} dateStyle="timer" />,
    compactTrailing: <Text>{content.setsSummaryCompact}</Text>,
    minimal: <Text>{content.setsRemainingLabel}</Text>,
    expandedLeading: (
      <VStack alignment="leading" spacing={4}>
        <HStack spacing={6}>
          {appIcon}
          <Text>{content.exerciseName}</Text>
        </HStack>
        <Text>{content.setLabel}</Text>
      </VStack>
    ),
    expandedTrailing:
      restEndsAt != null ? (
        <Text timerInterval={{ lower: new Date(), upper: new Date(restEndsAt) }} countsDown />
      ) : undefined,
    expandedBottom: (
      <VStack alignment="leading" spacing={8}>
        <HStack>
          <Text date={new Date(content.sessionStartedAt)} dateStyle="timer" />
          <Text>{content.setsSummaryExpanded}</Text>
        </HStack>
        {actionButtons}
      </VStack>
    ),
  };
});

let activeInstance: LiveActivity<LiveWorkoutActivityContent> | null = null;

function withAppIcon(content: LiveWorkoutActivityContent): LiveWorkoutActivityContent {
  return cachedAppIconUri ? { ...content, appIconUri: cachedAppIconUri } : content;
}

function start(content: LiveWorkoutActivityContent): void {
  const full = withAppIcon(content);
  const existing = factory.getInstances()[0];
  if (existing) {
    activeInstance = existing;
    void existing.update(full);
    return;
  }
  activeInstance = factory.start(full);
}

function update(content: LiveWorkoutActivityContent): void {
  if (!activeInstance) {
    start(content);
    return;
  }
  void activeInstance.update(withAppIcon(content));
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
