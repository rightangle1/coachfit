# Strength/general form-guide autopilot

This worker is intentionally resumable. Its source of truth is
`STRENGTH_GENERAL_FORM_GUIDE_MANIFEST.json`; never infer completion only from
chat history.

## Per wake-up procedure

1. Read the manifest and reconcile every `approved` record with its declared
   asset path and first-party `formGuide(...)` attachment in
   `src/domain/catalog/media.ts`.
2. If a `generating` record has no newer asset or manifest update after 20
   minutes, change it to `queued`, increment `retryCount`, and retain the
   failed prompt detail in `failureReason`.
3. Take the next ten `queued` records in file order. Before generating each
   card, ensure its persona's reference image exists; if not, generate that
   neutral full-body reference first and mark the persona reference approved.
   Then set the card to `generating` with the current timestamp.
4. Use the assigned persona reference image, the record's exact setup/action,
   its stated equipment, callouts, stages, and arrow. Generate one image per
   record; visually inspect it before accepting it.
   For a movement with a distinct start and finish, prefer two clean vertically
   stacked full-width stages over ghosted bodies. Each stage may repeat the
   same four callouts when that is clearer at mobile size. The accepted
   `br-plie-first-position` card is the visual-quality benchmark.
5. Reject an image if equipment is missing, limbs/callouts are cropped or
   unreadable, more than one motion arrow appears, the arrow direction is
   ambiguous, or the pose is unsafe. Retry once with a targeted correction.
   After the second failure, set only that record to `blocked` with evidence.
6. For an accepted image, save it at the declared path, insert it as the first
   `formGuide(require(...))` still without removing any existing still or clip,
   then set the record to `approved`.
7. Continue after a blocked record. Process as many of the ten-card batch as
   the available runtime permits, leaving remaining records explicitly queued
   for the next heartbeat. Run focused tests before yielding.

## Completion gate

Completion requires all 353 records to be `approved`, all declared files to
exist, and every strength/general catalog entry to expose a first-party form
guide. The six mobility attachment repairs are tracked separately in media.
