/**
 * Small, semantic icon set for navigation landmarks and actions. Icons stay
 * intentionally sparse: they orient a screen without competing with labels.
 */

import { SymbolView, type SymbolViewProps } from 'expo-symbols';

import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';

const ICONS = {
  workout: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  time: { ios: 'clock.fill', android: 'schedule', web: 'schedule' },
  warmup: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  conditioning: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  cooldown: { ios: 'leaf.fill', android: 'eco', web: 'eco' },
  checkin: { ios: 'heart.text.square.fill', android: 'health_metrics', web: 'health_metrics' },
  sleep: { ios: 'moon.fill', android: 'nightlight', web: 'nightlight' },
  energy: { ios: 'bolt.fill', android: 'bolt', web: 'bolt' },
  soreness: { ios: 'figure.strengthtraining.traditional', android: 'accessibility_new', web: 'accessibility_new' },
  movement: { ios: 'figure.strengthtraining.functional', android: 'directions_run', web: 'directions_run' },
  filter: { ios: 'line.3.horizontal.decrease.circle.fill', android: 'tune', web: 'tune' },
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  chevronDown: { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' },
  chevronUp: { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' },
  exclude: { ios: 'minus.circle', android: 'remove_circle_outline', web: 'remove_circle_outline' },
  restore: { ios: 'arrow.counterclockwise', android: 'undo', web: 'undo' },
  rotation: { ios: 'arrow.triangle.2.circlepath', android: 'sync', web: 'sync' },
  play: { ios: 'play.fill', android: 'play_arrow', web: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause', web: 'pause' },
  reset: { ios: 'arrow.counterclockwise', android: 'restart_alt', web: 'restart_alt' },
  current: { ios: 'arrow.right.circle.fill', android: 'arrow_circle_right', web: 'arrow_circle_right' },
  pending: { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' },
  selected: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  goalStrength: { ios: 'dumbbell.fill', android: 'fitness_center', web: 'fitness_center' },
  goalCardio: { ios: 'heart.fill', android: 'favorite', web: 'favorite' },
  goalMobility: { ios: 'figure.flexibility', android: 'self_improvement', web: 'self_improvement' },
  goalBurn: { ios: 'flame.fill', android: 'local_fire_department', web: 'local_fire_department' },
  target: { ios: 'scope', android: 'track_changes', web: 'track_changes' },
  favorite: { ios: 'star.fill', android: 'star', web: 'star' },
  favoriteOutline: { ios: 'star', android: 'star_border', web: 'star_border' },
  chevronLeft: { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' },
  trophy: { ios: 'trophy.fill', android: 'military_tech', web: 'military_tech' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  trash: { ios: 'trash.fill', android: 'delete', web: 'delete' },
  checkAll: { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' },
  privacy: { ios: 'lock.shield.fill', android: 'privacy_tip', web: 'privacy_tip' },
  warning: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
  add: { ios: 'plus.circle', android: 'add_circle_outline', web: 'add_circle_outline' },
  // Cardio modality tiles (ADR-0141) — Android/web Material equivalents are
  // best-effort approximations; several `figure.*` activity glyphs have no
  // 1:1 Material match.
  cardioRunning: { ios: 'figure.run', android: 'directions_run', web: 'directions_run' },
  cardioMachine: { ios: 'figure.elliptical', android: 'directions_bike', web: 'directions_bike' },
  cardioCombat: { ios: 'figure.boxing', android: 'sports_mma', web: 'sports_mma' },
  cardioJumpRope: { ios: 'figure.jumprope', android: 'sports_gymnastics', web: 'sports_gymnastics' },
  cardioAerobics: { ios: 'figure.step.training', android: 'directions_walk', web: 'directions_walk' },
  cardioBodyweight: { ios: 'figure.highintensity.intervaltraining', android: 'exercise', web: 'exercise' },
  cardioLoaded: { ios: 'figure.strengthtraining.functional', android: 'fitness_center', web: 'fitness_center' },
} as const satisfies Record<string, SymbolViewProps['name']>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 18,
  color = 'textMuted',
  tint,
}: {
  name: IconName;
  size?: number;
  color?: ColorToken;
  /** Raw themed tint for shared contextual-tone primitives. */
  tint?: string;
}) {
  const { colors } = useTheme();
  return <SymbolView name={ICONS[name]} size={size} tintColor={tint ?? colors[color]} type="hierarchical" />;
}
