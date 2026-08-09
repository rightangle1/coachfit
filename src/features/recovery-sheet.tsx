import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, MuscleFatigueMap, Row, SheetModal, Text, useTheme } from '@/design';
import { recoverySummary } from '@/app-lib/presentation';
import { MUSCLE_GROUP_LABELS } from '@/app-lib/options';
import { currentFatigue } from '@/services/sessions';
import type { MuscleGroup } from '@/domain/types';

export function RecoverySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();
  const fatigue = useMemo(() => currentFatigue(), []);
  const summary = useMemo(() => recoverySummary(fatigue), [fatigue]);
  const [selected, setSelected] = useState<MuscleGroup | undefined>();
  const detail = selected ? fatigue.details?.[selected] : undefined;

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="BODY" title="Recovery" closeLabel="Close recovery">
      <Card>
        <Text variant="body" color="textMuted">
          Estimated from completed sets, effort, and the time since each group was trained.
        </Text>
        <View style={{ marginTop: spacing.lg }}>
          <MuscleFatigueMap fatigue={fatigue} selectedGroup={selected} onSelect={setSelected} />
        </View>
        {selected && detail ? (
          <View style={{ marginTop: spacing.lg, gap: spacing.xs }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text variant="heading">{MUSCLE_GROUP_LABELS[selected]}</Text>
              <Text variant="label" color={detail.status === 'good' ? 'success' : detail.status === 'recovering' ? 'warning' : 'danger'}>
                {detail.status === 'good' ? 'Fresh' : detail.status === 'recovering' ? 'Recovering' : 'Fatigued'}
              </Text>
            </Row>
            <Text variant="body" color="textMuted">{Math.round(detail.score * 100)}% estimated fatigue</Text>
            {detail.lastTrainedAt ? (
              <Text variant="caption" color="textFaint">
                Last trained {new Date(detail.lastTrainedAt).toLocaleDateString()} · {detail.completedSets} completed sets
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>

      <Card>
        <Text variant="heading">Group status</Text>
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {([
            ['Fresh', summary.fresh, 'success'],
            ['Recovering', summary.recovering, 'warning'],
            ['Fatigued', summary.fatigued, 'danger'],
          ] as const).map(([label, groups, color]) => (
            <Pressable key={label} onPress={() => groups[0] && setSelected(groups[0])}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Text variant="body" weight="semibold">{label}</Text>
                <Text variant="label" color={color}>{groups.length}</Text>
              </Row>
              <Text variant="caption" color="textMuted" style={{ marginTop: 2 }}>
                {groups.length ? groups.map((group) => MUSCLE_GROUP_LABELS[group]).join(', ') : 'No groups in this state.'}
              </Text>
            </Pressable>
          ))}
        </View>
      </Card>
    </SheetModal>
  );
}
