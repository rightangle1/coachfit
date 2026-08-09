/**
 * Terms & Conditions — the liability/assumption-of-risk disclaimer, shown
 * from onboarding (acceptance required before a first-time profile saves)
 * and from Settings (read-only, any time). Content lives in
 * `@/app-lib/terms` so both the acceptance gate and this sheet read the
 * same copy and version.
 */

import { Card, SheetModal, Text, useTheme } from '@/design';
import { TERMS_SECTIONS, TERMS_VERSION } from '@/app-lib/terms';

export function TermsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      eyebrow="PLEASE READ"
      title="Terms & Conditions"
      closeLabel="Close terms and conditions"
    >
      <Text variant="caption" color="textMuted">
        Last updated {TERMS_VERSION}
      </Text>
      {TERMS_SECTIONS.map((section) => (
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
