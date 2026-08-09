/**
 * Default Live Activity port — Android, web, and Jest/Node. Live Activities are
 * an iOS-only capability; see `live-activity.ios.tsx` for the real implementation.
 *
 * Extension must match the `.ios.tsx` file's extension (`.tsx`, not `.ts`) —
 * Metro's resolver iterates `sourceExts` outer-loop, extension-first, checking
 * platform-suffixed/native/bare *within* each extension before moving to the
 * next. A bare `.ts` file here would resolve before Metro ever tried the
 * `.tsx` extension where `.ios.tsx` lives, silently shadowing it on iOS.
 */

import type { LiveActivityPort } from './live-activity-types';

export const liveActivityPort: LiveActivityPort = {
  isSupported: () => false,
  start: () => {},
  update: () => {},
  end: () => {},
};
