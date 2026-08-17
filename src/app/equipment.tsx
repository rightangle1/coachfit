/**
 * Equipment setup — mandatory first-run step (reached after onboarding, or
 * directly if a profile exists but no inventory yet). It is also the last
 * screen of first-run onboarding: terms acceptance and the walkthrough-vs-
 * start-training choice both live here (`features/equipment-form.tsx`) so
 * there's no separate "meet your coach" splash to pass through. Editing an
 * existing inventory happens in the "Equipment settings" sheet from Settings
 * instead (`equipment-form.tsx` is the shared body both use).
 */

import { useRouter } from 'expo-router';

import { Screen } from '@/design';
import { EquipmentForm } from '@/features/equipment-form';

export default function EquipmentScreen() {
  const router = useRouter();
  return (
    <Screen>
      <EquipmentForm onSaved={(destination) => router.replace(destination === 'tour' ? '/tour' as never : '/')} />
    </Screen>
  );
}
