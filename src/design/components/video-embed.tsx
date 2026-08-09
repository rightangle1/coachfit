/**
 * VideoEmbed (ADR-0303) — web implementation. A plain `<iframe>`; no new
 * dependency needed since react-native-web already renders through the DOM.
 * Metro resolves this file on web; `video-embed.native.tsx` on iOS/Android.
 */

import { createElement, useState } from 'react';

import { useTheme } from '../theme';
import { toYouTubeEmbedUrl } from './youtube';

export function VideoEmbed({ url }: { url: string }) {
  const { radii } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const embedUrl = toYouTubeEmbedUrl(url);
  if (!embedUrl) return null;

  const player = (src: string, full = false) => createElement('iframe', {
    key: 'player',
    src,
    title: 'Exercise demonstration video',
    style: full
      ? { width: '100%', height: '100%', border: 0 }
      : { width: '100%', aspectRatio: '16 / 9', border: 0, borderRadius: radii.lg, display: 'block' },
    allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
    allowFullScreen: true,
  });

  if (fullscreen) {
    return createElement('div', {
      style: { position: 'fixed', inset: 0, zIndex: 1000, background: '#000' },
    }, [
      player(`${embedUrl}?autoplay=1`, true),
      createElement('button', {
        key: 'close',
        type: 'button',
        onClick: () => setFullscreen(false),
        'aria-label': 'Close full screen video',
        style: { position: 'absolute', top: 16, right: 16, padding: '10px 14px', border: 0, borderRadius: 12, cursor: 'pointer' },
      }, 'Close'),
    ]);
  }

  return createElement('div', {
    style: { position: 'relative', width: '100%', aspectRatio: '16 / 9' },
  }, [
    player(embedUrl),
    createElement('button', {
      key: 'expand',
      type: 'button',
      onClick: () => setFullscreen(true),
      'aria-label': 'Open exercise video full screen',
      style: { position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0, borderRadius: radii.lg, background: 'transparent', cursor: 'pointer' },
    }),
  ]);
}
