import { useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { GROUP_TO_REGION, type BodyRegion, type FatigueState, type MuscleGroup } from '@/domain/types';
import { fatigueStatus } from '@/domain/engine';
import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { Chip } from './controls';
import { Row } from './layout';
import { Text } from './text';
import { useTheme } from '../theme';

type Side = 'front' | 'back';

interface Region {
  group: MuscleGroup;
  d: string;
  detail?: string;
}

const BODY_OUTLINE =
  'M113 67 C104 70 94 74 86 82 C78 90 73 101 69 114 L53 194 L73 200 L90 128 L96 131 L90 220 L96 270 L84 438 L113 438 L126 318 L134 318 L147 438 L176 438 L164 270 L170 220 L164 131 L170 128 L187 200 L207 194 L191 114 C187 101 182 90 174 82 C166 74 156 70 147 67 Z';

const FRONT_REGIONS: Region[] = [
  { group: 'neck', d: 'M115 65 C119 69 123 71 130 71 C137 71 141 69 145 65 L150 91 L110 91 Z', detail: 'M115 78 Q130 86 145 78' },
  { group: 'shoulders', d: 'M110 81 C98 77 89 81 82 90 C77 96 74 103 72 111 L93 123 L109 105 Z' },
  { group: 'shoulders', d: 'M150 81 C162 77 171 81 178 90 C183 96 186 103 188 111 L167 123 L151 105 Z' },
  { group: 'chest', d: 'M109 95 C116 88 124 89 129 98 L129 139 C115 136 104 129 96 118 Z', detail: 'M102 112 Q115 108 128 119' },
  { group: 'chest', d: 'M151 95 C144 88 136 89 131 98 L131 139 C145 136 156 129 164 118 Z', detail: 'M158 112 Q145 108 132 119' },
  { group: 'biceps', d: 'M90 121 L72 113 L65 157 C64 165 69 171 77 172 L87 168 Z' },
  { group: 'biceps', d: 'M170 121 L188 113 L195 157 C196 165 191 171 183 172 L173 168 Z' },
  { group: 'forearms', d: 'M76 174 L63 170 L57 208 C56 217 60 224 69 226 L79 220 Z' },
  { group: 'forearms', d: 'M184 174 L197 170 L203 208 C204 217 200 224 191 226 L181 220 Z' },
  { group: 'abs', d: 'M106 140 L128 143 L128 212 L105 201 L101 170 Z', detail: 'M106 161 L127 165 M105 182 L127 187' },
  { group: 'abs', d: 'M154 140 L132 143 L132 212 L155 201 L159 170 Z', detail: 'M154 161 L133 165 M155 182 L133 187' },
  { group: 'obliques', d: 'M99 137 L105 203 L93 217 L88 181 L91 151 Z' },
  { group: 'obliques', d: 'M161 137 L155 203 L167 217 L172 181 L169 151 Z' },
  { group: 'quads', d: 'M99 218 C106 214 116 216 125 220 L120 306 L89 306 L94 258 Z', detail: 'M98 240 Q108 247 121 241' },
  { group: 'quads', d: 'M161 218 C154 214 144 216 135 220 L140 306 L171 306 L166 258 Z', detail: 'M162 240 Q152 247 139 241' },
  { group: 'calves', d: 'M90 311 L119 311 L114 420 L86 420 L88 360 Z', detail: 'M90 360 L116 360' },
  { group: 'calves', d: 'M170 311 L141 311 L146 420 L174 420 L172 360 Z', detail: 'M170 360 L144 360' },
];

const BACK_REGIONS: Region[] = [
  { group: 'neck', d: 'M115 65 C119 69 123 71 130 71 C137 71 141 69 145 65 L150 92 L110 92 Z', detail: 'M115 78 Q130 86 145 78' },
  { group: 'shoulders', d: 'M110 82 C98 78 89 82 82 91 C77 97 74 104 72 112 L94 124 L110 105 Z' },
  { group: 'shoulders', d: 'M150 82 C162 78 171 82 178 91 C183 97 186 104 188 112 L166 124 L150 105 Z' },
  { group: 'back', d: 'M109 96 L129 96 L129 190 C115 188 103 179 96 166 Z', detail: 'M102 120 Q114 128 128 126 M101 149 Q115 154 128 151' },
  { group: 'back', d: 'M151 96 L131 96 L131 190 C145 188 157 179 164 166 Z', detail: 'M158 120 Q146 128 132 126 M159 149 Q145 154 132 151' },
  { group: 'triceps', d: 'M90 122 L72 114 L65 158 C64 166 69 173 77 174 L87 169 Z' },
  { group: 'triceps', d: 'M170 122 L188 114 L195 158 C196 166 191 173 183 174 L173 169 Z' },
  { group: 'forearms', d: 'M76 176 L63 172 L57 210 C56 219 60 226 69 228 L79 222 Z' },
  { group: 'forearms', d: 'M184 176 L197 172 L203 210 C204 219 200 226 191 228 L181 222 Z' },
  { group: 'lower_back', d: 'M96 160 C106 172 117 177 130 177 C143 177 154 172 164 160 L160 205 L130 222 L100 205 Z', detail: 'M106 186 Q130 197 154 186' },
  { group: 'glutes', d: 'M100 207 C112 204 124 209 129 221 L129 256 C115 256 103 251 94 240 Z' },
  { group: 'glutes', d: 'M160 207 C148 204 136 209 131 221 L131 256 C145 256 157 251 166 240 Z' },
  { group: 'hamstrings', d: 'M96 259 L125 261 L120 340 L90 337 L93 290 Z', detail: 'M97 287 L121 291' },
  { group: 'hamstrings', d: 'M164 259 L135 261 L140 340 L170 337 L167 290 Z', detail: 'M163 287 L139 291' },
  { group: 'calves', d: 'M91 343 L119 346 L115 420 L86 420 L88 375 Z', detail: 'M90 375 L117 378' },
  { group: 'calves', d: 'M169 343 L141 346 L145 420 L174 420 L172 375 Z', detail: 'M170 375 L143 378' },
];

function colorFor(group: MuscleGroup, state: FatigueState, colors: ReturnType<typeof useTheme>['colors']): string {
  const status = fatigueStatus(state.byGroup[group] ?? 0);
  if (status === 'fatigued') return colors.danger;
  if (status === 'recovering') return colors.warning;
  return colors.success;
}

export interface MuscleFatigueMapProps {
  fatigue: FatigueState;
  selectedGroup?: MuscleGroup;
  onSelect: (group: MuscleGroup) => void;
}

/** Tappable front/back muscle silhouette for the Today recovery card. */
export function MuscleFatigueMap({ fatigue, selectedGroup, onSelect }: MuscleFatigueMapProps) {
  const { colors, spacing } = useTheme();
  const [side, setSide] = useState<Side>('front');
  const regions = side === 'front' ? FRONT_REGIONS : BACK_REGIONS;

  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <Row gap="sm">
        <Chip label="Front" selected={side === 'front'} onPress={() => setSide('front')} />
        <Chip label="Back" selected={side === 'back'} onPress={() => setSide('back')} />
      </Row>
      <Svg width={236} height={430} viewBox="0 0 260 455" accessibilityLabel={`${side} body fatigue map`}>
        <Path d={BODY_OUTLINE} fill={colors.surfaceAlt} stroke={colors.borderStrong} strokeWidth={1.5} />
        <Circle cx="130" cy="39" r="25" fill={colors.surfaceAlt} stroke={colors.borderStrong} strokeWidth={1.5} />
        {regions.map((region, index) => {
          const status = fatigueStatus(fatigue.byGroup[region.group] ?? 0);
          const selected = selectedGroup === region.group;
          const regionColor = colorFor(region.group, fatigue, colors);
          return (
            <Path
              key={`${region.group}-${index}`}
              d={region.d}
              fill={regionColor}
              fillOpacity={selected ? 1 : 0.88}
              stroke={selected ? colors.text : colors.bg}
              strokeWidth={selected ? 2.5 : 2}
              strokeLinejoin="round"
              accessibilityLabel={`${MUSCLE_GROUP_LABELS[region.group]}: ${status}`}
              onPress={() => onSelect(region.group)}
            />
          );
        })}
        {regions.map((region, index) =>
          region.detail ? (
            <Path
              key={`detail-${region.group}-${index}`}
              d={region.detail}
              fill="none"
              stroke={colors.bg}
              strokeOpacity={0.22}
              strokeWidth={1.2}
              strokeLinecap="round"
              pointerEvents="none"
            />
          ) : null,
        )}
      </Svg>
      <Text variant="caption" color="textFaint" center>
        Tap a muscle for its recovery detail
      </Text>
    </View>
  );
}

export interface MuscleTargetMapProps {
  selectedGroups: MuscleGroup[];
  onToggle: (group: MuscleGroup) => void;
  /**
   * A broad area selection, shown as a soft, tappable highlight. Individual
   * muscles remain governed by selectedGroups, so people can refine the area
   * without losing the context of the larger selection.
   */
  highlightedRegion?: BodyRegion | 'all';
  /** Muscles deliberately removed from the broad area selection. */
  removedHighlightedGroups?: MuscleGroup[];
}

/** Tappable anatomy map for discovering exercises by the muscles they train.
 * Unlike the recovery map above, this never implies readiness or a score. */
export function MuscleTargetMap({ selectedGroups, onToggle, highlightedRegion, removedHighlightedGroups = [] }: MuscleTargetMapProps) {
  const { colors, spacing } = useTheme();
  const [side, setSide] = useState<Side>('front');
  const regions = side === 'front' ? FRONT_REGIONS : BACK_REGIONS;
  const hasAreaHighlight = Boolean(highlightedRegion);

  function isInHighlightedArea(group: MuscleGroup) {
    return highlightedRegion === 'all' || GROUP_TO_REGION[group] === highlightedRegion;
  }

  return (
    <View style={{ alignItems: 'center', gap: spacing.sm }}>
      <Row gap="sm">
        <Chip label="Front" selected={side === 'front'} onPress={() => setSide('front')} />
        <Chip label="Back" selected={side === 'back'} onPress={() => setSide('back')} />
      </Row>
      <Svg width={206} height={375} viewBox="0 0 260 455" accessibilityLabel={`${side} body target map`}>
        <Path d={BODY_OUTLINE} fill={hasAreaHighlight ? colors.primarySoft : colors.surfaceAlt} stroke={hasAreaHighlight ? colors.primary : colors.borderStrong} strokeWidth={1.5} />
        <Circle cx="130" cy="39" r="25" fill={hasAreaHighlight && highlightedRegion === 'all' ? colors.primarySoft : colors.surfaceAlt} stroke={hasAreaHighlight ? colors.primary : colors.borderStrong} strokeWidth={1.5} />
        {regions.map((region, index) => {
          const selected = selectedGroups.includes(region.group);
          const highlighted = isInHighlightedArea(region.group) && !removedHighlightedGroups.includes(region.group);
          const included = selected || highlighted;
          return (
            <Path
              key={`${region.group}-${index}`}
              d={region.d}
              fill={selected ? colors.primary : highlighted ? colors.primarySoft : colors.surface}
              fillOpacity={selected ? 0.94 : 1}
              stroke={selected ? colors.primaryText : highlighted ? colors.primary : colors.border}
              strokeWidth={selected ? 2.2 : highlighted ? 1.8 : 1.5}
              strokeLinejoin="round"
              accessibilityLabel={`${included ? 'Remove' : 'Add'} ${MUSCLE_GROUP_LABELS[region.group]} ${included ? 'from' : 'to'} the movement filter`}
              onPress={() => onToggle(region.group)}
            />
          );
        })}
      </Svg>
      <Text variant="caption" color="textFaint" center>
        Tap a muscle to filter movements
      </Text>
    </View>
  );
}
