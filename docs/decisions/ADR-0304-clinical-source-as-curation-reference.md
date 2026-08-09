# ADR-0304 — Cleveland Clinic as a curation reference, not a media/text source

- **Status:** Accepted
- **Date:** 2026-07-24
- **Phase:** 3

## Context
The mobility catalog (60 exercises: 28 `mob-*`, 18 `yg-*`, 8 `fr-*`, 6 `wu-*`)
covered generic full-body stretching well but had little condition- or
area-specific depth (IT band, plantar fasciitis, tennis elbow, piriformis,
low back, frozen shoulder, carpal tunnel). The ask was to lean on Cleveland
Clinic's published exercise content (health.clevelandclinic.org) to close
that gap.

Checking several of their articles directly first: their images are
proprietary (served from `assets.clevelandclinic.org`, not Wikimedia/CC-
licensed), and their demo videos are hosted on their own Kaltura instance,
not YouTube. Neither fits the catalog's two existing sanctioned media paths:
- **Stills** (ADR-0302) must be verifiably public-domain/CC-licensed and are
  bundled locally — Cleveland Clinic's images carry no such license.
- **Clips** (ADR-0303) are embedded inline, but only from YouTube — Cleveland
  Clinic's videos live on Kaltura, a platform the embed mechanism
  (`toYouTubeEmbedUrl`) doesn't recognize.

Reusing their media as-is would require a new ADR, a second embed platform,
and accepting a materially murkier copyright posture than the existing
YouTube case (their CDN manifest URLs look more like direct binary access
than a platform-native embeddable player).

## Options considered
- **Extend media embedding to Cleveland Clinic's Kaltura videos.** Would
  unlock their exact demo videos, but requires new engineering and a real,
  narrower copyright judgment call than YouTube's "any publicly viewable
  video" precedent — deferred, not ruled out forever.
- **Bundle their article images as stills.** Rejected outright — they carry
  no public-domain/CC license, so this would violate ADR-0302's bar as-is.
- **Use their articles as a curation/research reference only.** Read their
  content to decide which stretches to add and how to describe them
  accurately, write all copy fresh, and source any media strictly through
  the two paths already in place (Wikimedia stills, YouTube clips),
  otherwise falling back to the existing placeholder animation.

## Decision
Cleveland Clinic's stretch/mobility articles are used purely as a **clinical
curation reference** for this catalog expansion:
- They inform *which* stretches to add (condition-specific and region
  coverage gaps) and the *facts* of each movement (target area, setup, hold
  time, key form cue).
- `description`/`steps`/`cues` on every new exercise are written fresh, in
  the catalog's existing voice, never paraphrased sentence-by-sentence from
  their text. Naming a condition in an exercise's `name` (e.g. "Standing
  plantar fascia stretch") is fine — that's a factual/functional label, not
  copyrightable expression.
- No Cleveland Clinic images or videos are bundled or embedded anywhere in
  the app. Media continues to follow ADR-0302 (Wikimedia stills) and
  ADR-0303 (YouTube clips) exactly as before; most new entries ship with no
  `media` field and fall back to `MovementIllustration`, same as most of the
  existing 60.

Also: the real, non-duplicate content actually available across Cleveland
Clinic's stretch articles topped out at ~40 genuinely new exercises after
removing near-duplicates of existing catalog entries, partner-assisted
stretches (no "requires partner" concept exists in this app), and
strengthening moves miscategorized as "stretches" in their source articles
(clamshells, bridges, grip work, etc. — these train the same conditions but
aren't stretches, so they're out of scope here). 40 solid entries were
prioritized over padding to an arbitrary target.

## Consequences
- No new legal exposure: nothing proprietary is bundled or embedded; the
  existing media bar is unchanged.
- Establishes the precedent for the next time someone proposes pulling from
  a third-party clinical/editorial source — record why it doesn't fit
  existing media paths rather than re-litigating from scratch.
- Reversible: if Cleveland Clinic (or another source) later publishes
  YouTube-hosted demo content, those clips can be added under the existing
  ADR-0303 bar with no schema change. Extending embedding to a second
  platform (Kaltura or otherwise) remains a separate, deliberate future
  decision, not something this ADR commits to.
- In passing: `rules-engine.ts`'s stretch/yoga-flow stage-ordering logic and
  `Exercise.flowStage`'s doc comment both cite "ADR-0114," but no such file
  exists in `docs/decisions/` (the index jumps 0113 → 0115) — a pre-existing
  gap, unrelated to this change, noted here for whoever picks it up next.
