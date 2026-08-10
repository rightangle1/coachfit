/** The intentional handoff after the thorough profile + equipment setup. */

import { useRouter } from 'expo-router';
import { ImageBackground, View } from 'react-native';

import { Button, Card, HeroScrim, Icon, Row, Screen, Text, useTheme } from '@/design';
import { markAppTourComplete } from '@/app-lib/app-tour';
import { getAthleteProfile, saveAthleteProfile } from '@/services/athlete';

const TOUR_ART = require('../../assets/images/editorial/today-strength-v1.png');

export default function TourChoiceScreen() {
  const router = useRouter();
  const { colors, radii, spacing } = useTheme();

  function startTraining() {
    const profile = getAthleteProfile();
    if (profile) saveAthleteProfile(markAppTourComplete(profile));
    router.replace('/');
  }

  return (
    <Screen contentStyle={{ justifyContent: 'center', minHeight: '100%' }}>
      <ImageBackground
        source={TOUR_ART}
        style={{ minHeight: 420, borderRadius: radii.xxl, overflow: 'hidden', justifyContent: 'flex-end' }}
        imageStyle={{ borderRadius: radii.xxl }}
      >
        <HeroScrim />
        <View style={{ padding: spacing.xl, gap: spacing.sm }}>
          <Text variant="caption" color="heroText" weight="bold">YOUR PLAN IS READY</Text>
          <Text variant="display" color="heroText">Meet your coach</Text>
          <Text variant="body" color="heroMuted">
            Your training will adapt to your goals, recovery, equipment, and each workout you complete.
          </Text>
        </View>
      </ImageBackground>

      <Card elevated>
        <Row gap="sm" style={{ alignItems: 'flex-start' }}>
          <View style={{ width: 38, height: 38, borderRadius: radii.pill, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="target" color="primaryTextSoft" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="heading">Want a quick walkthrough?</Text>
            <Text variant="body" color="textMuted" style={{ marginTop: 4 }}>
              See how Today, Explore, Progress, and You work together. It takes about a minute and you can skip whenever you like.
            </Text>
          </View>
        </Row>
        <Button title="Take the walkthrough" onPress={() => router.replace('/tour')} fullWidth style={{ marginTop: spacing.lg }} />
        <Button title="Start training" variant="quiet" onPress={startTraining} fullWidth style={{ marginTop: spacing.sm }} />
      </Card>
    </Screen>
  );
}
