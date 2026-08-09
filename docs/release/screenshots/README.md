# CoachFit App Store Gallery

These six PNG masters are ordered for the iPhone App Store gallery and exported at **1284 × 2778 px** (an accepted 6.9-inch iPhone portrait size).

Every product screen, number, graph, and control is captured from the locally built **Release** version of CoachFit on an iPhone Simulator. The only added material is the clearly separate editorial treatment: headline area, crops/arrangement, tags, and the $3.99 ownership card.

| # | File | Real app state shown |
| --- | --- | --- |
| 1 | `01-training-that-fits.png` | Workout builder with seven distinct training modes plus goal, focus, and duration. |
| 2 | `02-plan-around-today.png` | Recovery readout paired with the Daily Check-in’s effort, sleep, and energy controls. |
| 3 | `03-exercises-your-rules.png` | Exercise preferences paired with the real available-equipment picker. |
| 4 | `04-keep-moving.png` | In-progress workout overview with completed sets, elapsed time, and adding an exercise. |
| 5 | `05-progress-made-visible.png` | Seeded history: 12 completed workouts, five-day streak, real strength total, and chart. |
| 6 | `06-own-your-training.png` | Real CoachFit home screen plus the separate one-time-purchase message. |

`source/` contains the untouched native captures. The editable SVG layouts live in [`svg/`](svg/). Run `node scripts/generate-store-screenshots.mjs` after changing the headline/crop copy, then render the six SVGs to recreate the PNGs.
