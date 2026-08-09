# ADR-0302 — Media sourcing & licensing

- **Status:** Accepted
- **Date:** 2026-07-22
- **Phase:** 3

## Context
CLAUDE.md §11 calls for curated public-domain stills and links to short
public-domain demo clips, with source + license recorded per asset, and a hard
rule to never embed copyrighted media. This needs: (1) a schema that carries
license/attribution data alongside each asset, not just a URL, and (2) an
actual sourcing process, since this is a content-verification task, not a pure
engineering one — mislabeling a license is the failure mode to design against.

Offline-first (CLAUDE.md §4 principle) applies here too: a still that's part of
the day's session should render with no network. A linked clip is explicitly
"link out," non-core, and may require network when tapped — that's the same
shape as any other external link and doesn't threaten offline use of the app.

## Options considered
- **Hotlink remote image URLs, fetch at render time.** Simplest, but violates
  offline-first for a still shown mid-session, and leaves the app dependent on
  a third party's URL staying valid forever.
- **Bundle stills as local assets; link out to clips only.** Stills become
  `require()`d files shipped in the app (offline, permanent); clips stay
  external links opened on demand (`expo-web-browser`, already a dependency) —
  matches how CLAUDE.md phrases the two ("stills" vs. "links to clips")
  differently on purpose.
- **Store binaries in a CMS/DB blob.** Overkill pre-cloud-sync; no backend
  exists yet and nothing here needs one.

## Decision
`ExerciseMedia` (`src/domain/types/exercise.ts`) — optional on `Exercise`,
replacing the unused `mediaRef` placeholder:

```ts
export type MediaLicense = 'public-domain' | 'cc0' | 'cc-by' | 'cc-by-sa';

export interface MediaAsset {
  license: MediaLicense;
  attribution: string; // credit line, shown in-app for cc-by/cc-by-sa
  sourceUrl: string;   // the source file page, for audit/traceability
}

export interface StillAsset extends MediaAsset {
  file: ImageSourcePropType; // require()'d local asset — bundled, offline
}

export interface ClipAsset extends MediaAsset {
  url: string; // external link-out, opened on demand, not bundled
}

export interface ExerciseMedia {
  stills?: StillAsset[];
  clips?: ClipAsset[];
}
```

`Exercise.media?: ExerciseMedia` lives in a separate content map
(`src/domain/catalog/media.ts`, keyed by exercise id) merged onto the seed
catalog in `catalog/index.ts` — keeps the movement/programming data in
`exercises.ts` free of binary/licensing content, and keeps this ADR's decision
swappable (e.g. to a remote asset manifest) without touching the `Exercise`
contract. Any exercise without an entry falls back to `MovementIllustration`
(ADR-0301) — this is the expected state for most of the catalog for now.

**Sourcing process (used for the seed assets below and for future additions):**
1. Search Wikimedia Commons for an exercise-specific category (e.g.
   `Category:Pull-ups`).
2. Open the specific file page and read its license template directly —
   category membership alone is not sufficient evidence of license.
3. Prefer `PD-USGov` / CC0 (no attribution obligation); CC-BY/CC-BY-SA are
   acceptable if attribution is recorded and rendered in-app.
4. Record `license`, `attribution`, and `sourceUrl` (the Commons file page, not
   the raw image URL) so the claim can be re-verified later.
5. Download, resize/compress (`sips`, no new tooling) to a mobile-appropriate
   size, and bundle under `assets/images/exercises/<exercise-id>.jpg`.

**Seed assets sourced this way (proof of concept, 4 of 24 exercises):**

| Exercise | File | License | Source |
|---|---|---|---|
| `pu-pushup` | `pushup.jpg` | public-domain (17 U.S.C. §105, USMC photographer on duty) | [Marines do pushups.jpg](https://commons.wikimedia.org/wiki/File:Marines_do_pushups.jpg) |
| `pl-pullup` | `pullup.jpg` | public-domain (U.S. Air Force work) | [U.S. Air Force Senior Airman Brandon Stout performs pull-ups.jpg](https://commons.wikimedia.org/wiki/File:U.S._Air_Force_Senior_Airman_Brandon_Stout_performs_pull-ups.jpg) |
| `sq-bw` | `bodyweight-squat.jpg` | public-domain (U.S. DoD/Air Force work) | [160530-F-YI145-049 (27242529600).jpg](https://commons.wikimedia.org/wiki/File:160530-F-YI145-049_(27242529600).jpg) |
| `co-plank` | `plank.jpg` | cc-by-sa (3.0) — attribution rendered in-app | [Plank.jpg](https://commons.wikimedia.org/wiki/File:Plank.jpg), credit: Jaykayfit |

No clip links were seeded in this pass — none were verified against the
`MediaProvenance` bar above. That bar turned out to be the wrong one for
video; ADR-0303 replaces it with an attribution-only requirement and seeds
the first clip (`pl-pullup`) under the new rule. The other catalog exercises
intentionally ship with no `media` entry.

## Consequences
- Every rendered still carries a verifiable license + source; nothing
  copyrighted is embedded.
- Stills work fully offline once installed; clip links are the only media
  surface that ever touches the network, and only on explicit tap.
- Sourcing the remaining catalog is an ongoing content task, not a blocking
  one — `MovementIllustration` covers the gap indefinitely.
- Reversible: the map in `media.ts` can be regenerated, moved to a remote
  manifest, or re-licensed per asset without touching `Exercise` or any screen.
