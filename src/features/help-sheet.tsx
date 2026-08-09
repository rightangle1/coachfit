import { View } from 'react-native';

import { ActionRow, Button, Card, Icon, SheetModal, Text, useTheme } from '@/design';
import { HELP_TOPICS, type HelpDestination } from '@/features/help-content';

export function HelpSheet({
  visible,
  onClose,
  onNavigate,
  onOpenMetrics,
  onReplayTour,
}: {
  visible: boolean;
  onClose: () => void;
  onNavigate: (destination: HelpDestination) => void;
  onOpenMetrics: () => void;
  onReplayTour: () => void;
}) {
  const { spacing } = useTheme();

  return (
    <SheetModal visible={visible} onClose={onClose} eyebrow="HELP" title="CoachFit guide" closeLabel="Close Help">
      <Text variant="body" color="textMuted">
        Short answers for shaping your plan and making a workout your own.
      </Text>
      {HELP_TOPICS.map((topic) => (
        <Card key={topic.id}>
          <Text variant="heading">{topic.title}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>{topic.body}</Text>
          {topic.id === 'metrics' ? (
            <ActionRow
              label="Read how your metrics work"
              description={topic.summary}
              icon={<Icon name={topic.icon} color="primaryTextSoft" />}
              onPress={onOpenMetrics}
              style={{ marginTop: spacing.md }}
            />
          ) : topic.action ? (
            <ActionRow
              label={topic.action.label}
              description={topic.summary}
              icon={<Icon name={topic.icon} color="primaryTextSoft" />}
              onPress={() => onNavigate(topic.action!.destination)}
              style={{ marginTop: spacing.md }}
            />
          ) : null}
        </Card>
      ))}
      <View style={{ marginTop: -spacing.xs }}>
        <Button title="Take the app tour again" variant="secondary" onPress={onReplayTour} fullWidth />
      </View>
    </SheetModal>
  );
}
