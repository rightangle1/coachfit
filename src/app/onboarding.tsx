/**
 * Onboarding — mandatory first-run setup (Today redirects here with no
 * profile yet). Editing an existing profile happens in the "Edit training
 * profile" sheet from Settings instead (`features/onboarding-form.tsx` is
 * the shared body both use).
 */

import { useRouter } from 'expo-router';

import { Screen } from '@/design';
import { OnboardingForm } from '@/features/onboarding-form';

export default function OnboardingScreen() {
  const router = useRouter();
  return (
    <Screen>
      <OnboardingForm onSaved={() => router.replace('/equipment')} />
    </Screen>
  );
}
