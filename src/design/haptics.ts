/**
 * Haptics (ADR-0130) — one wrapper so screens never import `expo-haptics`
 * directly and never have to remember the `.catch()`.
 *
 * Every call is fire-and-forget and swallows its error: haptics are
 * unavailable on web and on devices with the Taptic Engine disabled, and a
 * missing buzz must never interrupt logging a set. Intensity is chosen by role,
 * not by raw API name, so the app's feedback stays consistent:
 *
 * - `selection` — moving between options (chips, tabs, steppers)
 * - `impact`    — committing something (completing a set or exercise)
 * - `success` / `warning` — outcomes worth noticing
 */

import * as Haptics from 'expo-haptics';

export type HapticRole = 'selection' | 'impact' | 'success' | 'warning';

export function haptic(role: HapticRole): void {
  switch (role) {
    case 'selection':
      Haptics.selectionAsync().catch(() => {});
      return;
    case 'impact':
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      return;
    case 'success':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      return;
    case 'warning':
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  }
}
