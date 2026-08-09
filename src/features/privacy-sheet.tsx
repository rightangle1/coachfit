/**
 * Privacy Policy — shown from onboarding (acceptance required before a
 * first-time profile saves) and from Settings (read-only, any time). Content
 * lives in `@/app-lib/privacy` so both the acceptance gate and this sheet
 * read the same copy and version.
 */

import { Card, SheetModal, Text, useTheme } from '@/design';
import { PRIVACY_SECTIONS, PRIVACY_VERSION } from '@/app-lib/privacy';

export function PrivacySheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      eyebrow="PLEASE READ"
      title="Privacy Policy"
      closeLabel="Close privacy policy"
    >
      <Text variant="caption" color="textMuted">
        Last updated {PRIVACY_VERSION}
      </Text>
      {PRIVACY_SECTIONS.map((section) => (
        <Card key={section.title}>
          <Text variant="heading">{section.title}</Text>
          <Text variant="body" color="textMuted" style={{ marginTop: spacing.xs }}>
            {section.body}
          </Text>
        </Card>
      ))}
    </SheetModal>
  );
}
