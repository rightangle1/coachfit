# CoachFit App Store Gallery

These ten PNG masters are ordered for the iPhone App Store gallery and exported at **1284 × 2778 px** (an accepted 6.9-inch iPhone portrait size).

Every product screen, number, graph, and control is captured from the locally built **Release** version of CoachFit on an iPhone Simulator. The only added material is the clearly separate editorial treatment: headline area, crops/arrangement, tags, and the $3.99 ownership card.

| # | File | Real app state shown |
| --- | --- | --- |
| 1 | `01-training-that-fits.png` | Explore landing screen with strength, cardio, mobility, and recovery paths. |
| 2 | `02-plan-around-today.png` | Searchable movement library with equipment-aware exercise details. |
| 3 | `03-exercises-your-rules.png` | Body-map movement filtering. |
| 4 | `04-keep-moving.png` | Available-equipment selection for a workout that matches the athlete’s space. |
| 5 | `05-progress-made-visible.png` | Workout-type selection including bodybuilding, sculpting, stretch, yoga, and cardio. |
| 6 | `06-own-your-training.png` | The complete session flow, from warmup through main work. |
| 7 | `07-stay-focused-set-by-set.png` | Native set logging with reps and live workout controls. |
| 8 | `08-move-with-confidence.png` | In-app form guide for clear exercise technique. |
| 9 | `09-progress-made-visible.png` | Progress dashboard with training history and performance trends. |
| 10 | `10-the-work-adds-up.png` | Calendar-based completed-session history. |

`source/` contains the untouched native captures, including the refreshed `rev2-*` iPhone captures. The editable SVG layouts live in [`svg/`](svg/). Run `node scripts/generate-store-screenshots.mjs`, then `swift scripts/render-store-screenshots.swift`, and finally `python3 scripts/flatten-store-screenshots.py` to recreate the ten upload-ready PNG masters.
