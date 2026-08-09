/**
 * YouTube URL → embed URL (ADR-0303). The only clip source `VideoEmbed`
 * currently understands; broadening to another platform is contained here.
 *
 * Embeds from youtube-nocookie.com rather than youtube.com: on iOS,
 * youtube.com is a registered Universal Link domain, so any in-WebView
 * navigation the player triggers (e.g. tapping play) gets intercepted by
 * the OS and kicked out to the YouTube app instead of playing inline.
 * youtube-nocookie.com serves the same embed player but isn't registered
 * for Universal Links, so playback stays in-app.
 */

const YOUTUBE_ID_PATTERN = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

export function toYouTubeEmbedUrl(url: string): string | null {
  const match = url.match(YOUTUBE_ID_PATTERN);
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}
