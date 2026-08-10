/**
 * Equipment setup — mandatory first-run step (reached after onboarding, or
 * directly if a profile exists but no inventory yet). Editing an existing
 * inventory happens in the "Edit equipment" sheet from Settings instead
 * (`features/equipment-form.tsx` is the shared body both use).
 */

import { useRouter } from 'expo-router';

import { Screen } from '@/design';
import { needsAppTour } from '@/app-lib/app-tour';
import { EquipmentForm } from '@/features/equipment-form';
import { getAthleteProfile } from '@/services/athlete';

export default function EquipmentScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EquipmentForm onSaved={() => router.replace(needsAppTour(getAthleteProfile()) ? '/tour-choice' as never : '/')} />
    </Screen>
  );
}
