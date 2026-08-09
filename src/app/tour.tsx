/** First-run app tour. It is a normal hidden route rather than a transient
 * modal so an interrupted setup can safely resume from the same point. */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Icon, Row, Screen, Text, useTheme } from '@/design';
import { markAppTourComplete } from '@/app-lib/app-tour';
import { helpTopic, TOUR_TOPIC_IDS, type HelpDestination } from '@/features/help-content';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';
import { hasEquipmentInventory } from '@/services/equipment';

export default function TourScreen() {
  const router = useRouter();
  const { colors, spacing } = useTheme();
  const [step, setStep] = useState(0);
  const topic = useMemo(() => helpTopic(TOUR_TOPIC_IDS[step]), [step]);
  const lastStep = step === TOUR_TOPIC_IDS.length - 1;

  useEffect(() => {
    const profile = getAthleteProfile();
    if (!profile) router.replace('/onboarding');
    else if (!hasEquipmentInventory()) router.replace('/equipment');
  }, [router]);

  function complete() {
    const profile = getAthleteProfile();
    if (profile) saveAthleteProfile(markAppTourComplete(profile));
  }

  function finish() {
    complete();
    router.replace('/');
  }

  function openDestination(destination: HelpDestination) {
    complete();
    if (destination === 'today') {
      router.replace({ pathname: '/', params: { scrollTo: 'build' } });
      return;
    }
    const params = destination === 'profile'
      ? { profile: '1' }
      : destination === 'catalog'
        ? { catalog: '1' }
        : { equipment: '1' };
    router.replace({ pathname: '/settings', params });
  }

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption" color="textMuted" weight="bold">QUICK TOUR · {step + 1} OF {TOUR_TOPIC_IDS.length}</Text>
        <Button title="Skip" variant="quiet" size="sm" onPress={finish} />
      </Row>
      <View style={{ flexDirection: 'row', gap: spacing.xs }}>
        {TOUR_TOPIC_IDS.map((id, index) => (
          <View key={id} style={{ flex: 1, height: 5, borderRadius: 99, backgroundColor: index <= step ? colors.primary : colors.border }} />
        ))}
      </View>
      <Card tone="primarySoft" elevated>
        <Icon name={topic.icon} size={30} color="primaryTextSoft" />
        <Text variant="caption" color="primaryTextSoft" weight="bold" style={{ marginTop: spacing.lg }}>COACHFIT BASICS</Text>
        <Text variant="display" color="primaryTextSoft" italic style={{ marginTop: spacing.xs }}>{topic.title}</Text>
        <Text variant="body" color="primaryTextSoft" style={{ marginTop: spacing.md }}>{topic.body}</Text>
      </Card>
      <View style={{ gap: spacing.sm }}>
        {topic.action ? (
          <Button title={topic.action.label} onPress={() => openDestination(topic.action!.destination)} fullWidth />
        ) : null}
        <Row gap="sm">
          {step > 0 ? <Button title="Back" variant="secondary" onPress={() => setStep((current) => current - 1)} style={{ flex: 1 }} /> : null}
          <Button
            title={lastStep ? 'Start training' : 'Next'}
            variant={step > 0 ? 'secondary' : 'primary'}
            onPress={lastStep ? finish : () => setStep((current) => current + 1)}
            style={{ flex: 1 }}
          />
        </Row>
      </View>
      <Text variant="caption" color="textFaint">
        You can revisit these tips any time in Settings → Help.
      </Text>
    </Screen>
  );
}
