# ADR-0303 — Clip licensing bar + in-app embedded player

- **Status:** Accepted
- **Date:** 2026-07-22
- **Phase:** 3

## Context
ADR-0302 gated both stills and clips behind the same `MediaProvenance` shape —
license drawn from `MediaLicense` (`public-domain` / `cc0` / `cc-by` /
`cc-by-sa`) plus attribution — and shipped clips as an external "Watch demo
clip" button (`expo-web-browser`, opens the system browser). No clips were
ever seeded against that bar: verified-license video is far scarcer than
verified-license stills, and it left the enrichment plan stalled on the
harder of the two asset types.

The product call: for **stills**, the bar stays as-is — bundled into the app,
so public-domain/CC0 preferred with CC-BY/CC-BY-SA as a documented fallback
(ADR-0302 unchanged). For **clips**, the bar loosens — any publicly viewable
demo video is acceptable as long as its creator is clearly credited in-app —
and the UX moves from a link-out button to an inline embedded player.

This changes what CLAUDE.md §11's "never embed copyrighted media" has to mean.
Read literally against the new decision it looks contradictory, so the terms
need to be disambiguated:
- **Bundling** — downloading a binary and shipping it inside the app package
  (`require()`d stills, ADR-0302). This is the thing "never embed copyrighted
  media" actually protects against, and it's unchanged: stills are still
  license-gated, still bundled only when verified.
- **Streaming/embedding a player** — rendering an inline player (iframe/
  WebView) pointed at content that stays hosted on the source platform. The
  app never stores or redistributes the video file; this is the same
  copyright posture as linking out, just rendered inline instead of behind a
  tap-through. This is what's now allowed for clips, gated on visible
  attribution instead of a license field.

## Options considered
- **Keep the PD/CC-only bar for clips, just render inline.** Doesn't solve the
  actual problem — the scarcity of licensed video, not the UX around it —
  and clips would stay unseeded indefinitely.
- **Loosen the bar, keep the link-out button.** Solves sourcing but the
  original ask is specifically for inline viewing, not another tap-through.
- **Loosen the bar to any publicly viewable video + require in-app
  attribution, render via an inline embedded player.** Solves sourcing
  (any decent public demo video qualifies) and gets the inline-viewing UX,
  at the cost of a new dependency and a real (if narrow) copyright judgment
  call: we're never bundling the video, only ever streaming from the source
  platform with the creator credited, which is the same posture as any app
  that embeds a YouTube player.

## Decision
1. **`ClipAsset` drops the license gate.** It no longer extends
   `MediaProvenance` (`src/domain/types/exercise.ts`). New shape:
   ```ts
   export interface ClipAsset {
     url: string;      // canonical watch URL (source of truth + embed derivation)
     title: string;     // video title, shown as part of in-app attribution
     creator: string;   // channel/creator name — always rendered, no exceptions
   }
   ```
   `title` + `creator` are required on every clip, unconditionally — unlike
   stills, where attribution only renders for cc-by/cc-by-sa. There's no
   license tier here to make attribution optional for.

2. **YouTube only, for now.** The embed derivation (`toYouTubeEmbedUrl` in
   `src/design/components/youtube.ts`) only recognizes youtube.com/youtu.be
   URLs. Narrowest scope that covers the overwhelming majority of available
   fitness demo content; adding another platform later only touches this one
   function and the URL stored in `media.ts`.

3. **Inline embedded player, platform-split per the ADR-0007 port pattern.**
   `VideoEmbed` (`src/design/components/`):
   - `video-embed.tsx` (default, resolves on web) — a plain `<iframe>` via
     `React.createElement('iframe', …)`, no new dependency; react-native-web
     already renders through the DOM.
   - `video-embed.native.tsx` — `react-native-webview`'s `WebView` loading the
     same `youtube.com/embed/<id>` URL. New dependency, justified: it's the
     standard, actively-maintained RN solution for loading arbitrary web
     content, used narrowly here (native-only import, one call site).
   - `ExerciseMediaCard` renders `VideoEmbed` plus a visible
     "{title} — {creator}" line beneath it, replacing the old link-out button.

4. **Offline-first posture is unchanged from ADR-0302's clip carve-out**: a
   clip is non-core, opened/rendered only when the user views that exercise's
   media, and requires network at that point — same shape as the previous
   link-out button, just inline instead of a tap-through.

## Consequences
- Unblocks clip sourcing — the actual bottleneck was license scarcity, not
  the embed mechanism.
- Every clip is unconditionally attributed in-app; there is no unattributed
  video path.
- Stills are untouched: still bundled, still license-gated per ADR-0302.
- New dependency (`react-native-webview`), native-only in practice (web keeps
  using a bare iframe, matching the persistence-port precedent in ADR-0007).
- Narrowed to YouTube; broadening later is a small, contained change.
- Reversible: tightening the clip bar back to PD/CC, or swapping the embed
  mechanism, only touches `ClipAsset`, `youtube.ts`, and the two
  `video-embed.*` files — no engine or catalog-schema changes either way.
