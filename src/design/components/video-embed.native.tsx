/**
 * VideoEmbed (ADR-0303) — native implementation via `react-native-webview`,
 * loading the same `youtube-nocookie.com/embed/<id>` player as the web
 * `<iframe>`.
 *
 * The player is loaded as an HTML wrapper with `baseUrl` rather than as a
 * direct `source.uri` navigation. On iOS, WKWebView sends no `Referer`
 * header for a direct top-level navigation to the embed URL, and YouTube's
 * player requires one — without it playback fails with "Error 153: Video
 * player configuration error" on physical devices (this doesn't reproduce
 * in a browser-based preview, only in the real WKWebView). Wrapping the
 * iframe in HTML with `baseUrl` gives WKWebView a real origin to send as
 * the referrer.
 */

import { useState } from 'react';
import { Modal, Pressable, SafeAreaView, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { useTheme } from '../theme';
import { Text } from './text';
import { toYouTubeEmbedUrl } from './youtube';

const EMBED_BASE_URL = 'https://www.youtube-nocookie.com';

function embedHtml(embedUrl: string, autoplay: boolean) {
  const src = autoplay ? `${embedUrl}?autoplay=1&playsinline=1` : `${embedUrl}?playsinline=1`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{position:absolute;inset:0;width:100%;height:100%;border:0}</style></head><body><iframe src="${src}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></body></html>`;
}

export function VideoEmbed({ url }: { url: string }) {
  const { colors, radii, spacing } = useTheme();
  const [fullscreen, setFullscreen] = useState(false);
  const embedUrl = toYouTubeEmbedUrl(url);
  if (!embedUrl) return null;

  // Belt-and-suspenders alongside the youtube-nocookie.com domain switch in
  // `toYouTubeEmbedUrl`: refuse any navigation the embed player tries to
  // make outside its own origin, so nothing can hand off to the YouTube app.
  const stayOnEmbedOrigin = (request: { url: string }) =>
    request.url.startsWith(EMBED_BASE_URL) || request.url.startsWith('about:blank');

  return (
    <>
      <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radii.lg, overflow: 'hidden' }}>
        <WebView
          source={{ html: embedHtml(embedUrl, false), baseUrl: EMBED_BASE_URL }}
          style={{ flex: 1 }}
          allowsFullscreenVideo
          allowsInlineMediaPlayback
          onShouldStartLoadWithRequest={stayOnEmbedOrigin}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open exercise video full screen"
          onPress={() => setFullscreen(true)}
          style={{ position: 'absolute', inset: 0 }}
        />
      </View>

      <Modal visible={fullscreen} animationType="fade" onRequestClose={() => setFullscreen(false)}>
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <WebView
            source={{ html: embedHtml(embedUrl, true), baseUrl: EMBED_BASE_URL }}
            style={{ flex: 1 }}
            allowsFullscreenVideo
            allowsInlineMediaPlayback
            mediaPlaybackRequiresUserAction={false}
            onShouldStartLoadWithRequest={stayOnEmbedOrigin}
          />
          <SafeAreaView style={{ position: 'absolute', top: 0, right: 0 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close full screen video"
              onPress={() => setFullscreen(false)}
              style={{ margin: spacing.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.md, backgroundColor: colors.surface }}
            >
              <Text variant="label" weight="semibold">Close</Text>
            </Pressable>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
