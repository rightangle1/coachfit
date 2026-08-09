/**
 * Favorite/exclude toggle chips — the same look and labels everywhere an
 * athlete can favorite or exclude an exercise (the exercise catalog in
 * Settings, and the exercise detail hero). One place so the two states never
 * drift into different colors/icons/wording across screens.
 */

import { Chip, Icon } from '@/design';
import type { IconName } from '@/design';

export function FavoriteToggle({
  active,
  onPress,
  activeLabel = 'Favorited',
  inactiveLabel = 'Favorite',
}: {
  active: boolean;
  onPress: () => void;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <Chip
      label={active ? activeLabel : inactiveLabel}
      icon={<Icon name={active ? 'favorite' : 'favoriteOutline'} size={15} color={active ? 'warning' : 'textMuted'} />}
      selected={active}
      onPress={onPress}
    />
  );
}

export function ExcludeToggle({
  active,
  onPress,
  activeLabel = 'Excluded',
  inactiveLabel = 'Exclude',
  activeIcon = 'selected',
}: {
  active: boolean;
  onPress: () => void;
  activeLabel?: string;
  inactiveLabel?: string;
  /** Icon shown when active — defaults to a checkmark; the catalog's "excluded" tab
   *  swaps in the "restore" icon since every row there is already excluded. */
  activeIcon?: IconName;
}) {
  return (
    <Chip
      label={active ? activeLabel : inactiveLabel}
      icon={<Icon name={active ? activeIcon : 'exclude'} size={15} color={active ? 'primaryTextSoft' : 'textMuted'} />}
      selected={active}
      onPress={onPress}
    />
  );
}
