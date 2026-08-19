/**
 * Enriched exercise media (ADR-0302). Keyed by exercise id, merged onto the
 * seed catalog in `index.ts`. Kept separate from `exercises.ts` so the
 * licensing/binary content doesn't bloat the movement/programming data, and so
 * this map can be regenerated or moved to a remote manifest independently.
 *
 * Every entry here was hand-verified against its Wikimedia Commons file page
 * (not just category membership) — see ADR-0302's sourcing table. Exercises
 * with no entry fall back to `MovementIllustration` (ADR-0301); that's the
 * expected state for most of the catalog for now.
 */

import type { ExerciseMedia, StillAsset } from '../types';

/** Original, in-app alignment cards generated for the yoga instruction set. */
const formGuide = (file: StillAsset['file']): StillAsset => ({
  file,
  license: 'app-original',
  attribution: 'FitnessTrainter original instructional image',
  sourceUrl: 'Generated in-house with OpenAI image generation, August 2026',
  role: 'form-guide',
});

export const EXERCISE_MEDIA: Record<string, ExerciseMedia> = {
  'br-plie-first-position': {
    stills: [formGuide(require('../../../assets/images/exercises/br-plie-first-position-form-guide.webp'))],
  },
  'br-plie-second-position': {
    stills: [formGuide(require('../../../assets/images/exercises/br-plie-second-position-form-guide.webp'))],
  },
  'br-releve-calf-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/br-releve-calf-raise-form-guide.webp'))],
  },
  'br-arabesque-pulse': {
    stills: [formGuide(require('../../../assets/images/exercises/br-arabesque-pulse-form-guide.webp'))],
  },
  'br-standing-donkey-kick': {
    stills: [formGuide(require('../../../assets/images/exercises/br-standing-donkey-kick-form-guide.webp'))],
  },
  'br-hundred-prep': {
    stills: [formGuide(require('../../../assets/images/exercises/br-hundred-prep-form-guide.webp'))],
  },
  'br-plank-tuck': {
    stills: [formGuide(require('../../../assets/images/exercises/br-plank-tuck-form-guide.webp'))],
  },
  'br-tricep-kickback-pulse': {
    stills: [formGuide(require('../../../assets/images/exercises/br-tricep-kickback-pulse-form-guide.webp'))],
  },
  'br-bicep-curl-hold': {
    stills: [formGuide(require('../../../assets/images/exercises/br-bicep-curl-hold-form-guide.webp'))],
  },
  'br-seated-arm-pulses': {
    stills: [formGuide(require('../../../assets/images/exercises/br-seated-arm-pulses-form-guide.webp'))],
  },
  'pl-the-hundred-flow': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-the-hundred-flow-form-guide.webp'))],
  },
  'pl-roll-up-flow': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-roll-up-flow-form-guide.webp'))],
  },
  'pl-single-leg-stretch-flow': { stills: [formGuide(require('../../../assets/images/exercises/pl-single-leg-stretch-flow-form-guide.webp'))] },
  'pl-double-leg-stretch-flow': { stills: [formGuide(require('../../../assets/images/exercises/pl-double-leg-stretch-flow-form-guide.webp'))] },
  'pl-criss-cross': { stills: [formGuide(require('../../../assets/images/exercises/pl-criss-cross-form-guide.webp'))] },
  'pl-leg-pull-front': { stills: [formGuide(require('../../../assets/images/exercises/pl-leg-pull-front-form-guide.webp'))] },
  'pl-swimming-flow': { stills: [formGuide(require('../../../assets/images/exercises/pl-swimming-flow-form-guide.webp'))] },
  'pl-superman-hold': { stills: [formGuide(require('../../../assets/images/exercises/pl-superman-hold-form-guide.webp'))] },
  'pl-standing-balance-reach': { stills: [formGuide(require('../../../assets/images/exercises/pl-standing-balance-reach-form-guide.webp'))] },
  // ---- Resistance band catalog expansion (ADR-0117) — clips verified via
  // YouTube's oEmbed endpoint (real, currently-live URLs; title/creator taken
  // verbatim from the response, not guessed).
  'hi-band-loop-lateral-walk': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-lateral-walk-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=PhNkkOieB-8', title: 'Lateral Band Walk', creator: "Women's Strength Nation by Holly Perkins" },
    ],
  },
  'hi-band-loop-clamshell': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-clamshell-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=ymjOGuPjOSE', title: 'Clam Shell Exercise for Hips | Banded Clamshells for Abductor Activation', creator: 'FITBODY with Julie Lohre' },
    ],
  },
  'hi-clamshell': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-clamshell-form-guide.webp'))],
  },
  'hi-band-loop-monster-walk': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-monster-walk-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=hE4UsbLMjC8', title: 'Resistance Band Monster Walk', creator: 'Clench Fitness' },
    ],
  },
  'hi-band-loop-glute-bridge': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-glute-bridge-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=ktdIgom5B18', title: 'How To Do GLUTE BRIDGES With Resistance Bands // Maximize Your Booty', creator: 'Fitasamamabear Strength Training & Nutrition Coach' },
    ],
  },
  'hi-band-loop-fire-hydrant': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-fire-hydrant-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=Gn7b4qVxFYA', title: 'How To Do The BANDED FIRE HYDRANT EXERCISE | Exercise Demonstration Video and Guide', creator: 'Live Lean TV Daily Exercises' },
    ],
  },
  'hi-band-loop-donkey-kick': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-donkey-kick-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=A0iUAb4xUck', title: 'How to Do Donkey Kicks with Resistance Bands | Movement Breakdown', creator: 'LivingFit' },
    ],
  },
  'hi-band-loop-standing-abduction': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-standing-abduction-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=v-tN9LG547I', title: 'Banded Hip Abduction | Band | Strength and Conditioning Exercises', creator: 'Rehab My Patient' },
    ],
  },
  'hi-band-loop-frog-pump': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-frog-pump-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=rzjQ8XpXt1Q', title: 'Banded Frog Pump', creator: 'Glute Lab' },
    ],
  },
  'hi-band-loop-kickback': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-kickback-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=pdP0uJXvc44', title: 'Standing Banded Kickback', creator: 'OPEX Fitness' },
    ],
  },
  'lu-band-loop-curtsy-lunge': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-band-loop-curtsy-lunge-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=iNmJlBrTrl8', title: 'Banded Curtsy Lunge', creator: 'The Queen of Lean' },
    ],
  },
  'lu-band-loop-lateral-lunge': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-band-loop-lateral-lunge-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=SryEGxlB6oA', title: 'How To: Banded Side Lunge or Lateral Lunge | Blatnik Strength | Exercise Index', creator: 'Strength Empire Gym' },
    ],
  },
  'sq-band-loop-terminal-knee-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-band-loop-terminal-knee-extension-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=WEcLkuvcMZc', title: 'How To: Banded Terminal Knee Extension (TKE)', creator: 'Live Lean TV Daily Exercises' },
    ],
  },
  'co-band-loop-crab-walk': {
    clips: [
      { url: 'https://www.youtube.com/watch?v=wNtcZS-_ZO4', title: 'Banded crab walks to improve glute activation and hip strength', creator: 'Activ Therapy Health Clinics' },
    ],
  },
  'pl-band-loop-pull-apart': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-loop-pull-apart-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=pABreZZwQN8', title: 'Mini Band Prone Pull Apart | Exercise Demo | Coaching Software | QuickCoach', creator: 'QuickCoach' },
    ],
  },
  'pl-band-assisted-pullup': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-assisted-pullup-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=4yE-XGDWJPg', title: 'How to do Banded Assisted Pull-Ups', creator: 'REP' },
    ],
  },
  'pl-band-single-arm-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-single-arm-row-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=WCC6YtrrPVA', title: 'Resistance Band Single Arm Row', creator: 'billyrobbinfit' },
    ],
  },
  'de-band-external-rotation': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-external-rotation-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=ybNV36DoRfY', title: 'Banded Shoulder External Rotation | Band | Strength and Conditioning Exercises', creator: 'Rehab My Patient' },
    ],
  },
  'mob-band-hamstring-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-hamstring-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=0HsJaEIE0bc', title: 'Stretch Tutorial: Lateral Hamstring Stretch With Resistance Band', creator: 'Travis Tarrant' },
    ],
  },
  'mob-band-doorway-chest-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-doorway-chest-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=M850sCj9LHQ', title: 'How to Do a Doorway Pec Stretch Exercise | 90 Degrees Abduction | MedBridge', creator: 'Medbridge' },
    ],
  },
  'mob-band-lat-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-lat-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=iaAsxl0OfIc', title: 'Banded Lat Stretch | CrossFit Invictus', creator: 'CrossFit Invictus' },
    ],
  },
  'mob-band-loop-90-90-hip-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-loop-90-90-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=_rzJ1RXhM90', title: 'How To Do The 90/90 Hip Stretch | Exercise Demonstration Video and Guide', creator: 'Live Lean TV Daily Exercises' },
    ],
  },
  'wu-band-loop-ankle-mobilization': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-band-ankle-mobilization-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=YgSRw1fo5Xs', title: 'Banded Ankle Mobilizations | Ankle Dorsiflexion & Lower-Leg Mobility', creator: 'Replay Baseball Institue' },
    ],
  },
  'mob-band-shoulder-er-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-shoulder-er-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=_UvmPNGtlPM', title: 'Shoulder External Rotation with Resistive Band - Ask Doctor Jo', creator: 'AskDoctorJo' },
    ],
  },
  'hi-band-standing-hip-abduction': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-standing-hip-abduction-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=fR_yq6V4yxc', title: 'Band Standing Hip Abduction', creator: 'Glute Lab' },
    ],
  },
  'pu-band-incline-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-band-incline-press-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=Infd_StwnTg', title: 'Resistance Band Incline Chest Press', creator: 'Pursuit Fitness' },
    ],
  },
  'de-band-rear-delt-fly': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-rear-delt-fly-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=8TS775tZvKQ', title: "Banded Rear Delt Fly's | Row Patterning", creator: 'Dr. Carl Baird' },
    ],
  },
  'de-band-internal-rotation': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-internal-rotation-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=MfjCK5_Ss5g', title: 'How To Do An Internal Rotation with Band | Exercise Guide', creator: 'Bodybuilding.com' },
    ],
  },
  'pl-band-seated-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-seated-row-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=PKZW3s3G_Y0', title: 'How to Do Seated Rows with Resistance Bands! (With and without an Anchor)', creator: 'Scott Abel Coaching' },
    ],
  },
  'hi-band-loop-single-leg-glute-bridge': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-single-leg-glute-bridge-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=18GVqjfHy-M', title: 'Single Leg Bridge | Step-by-Step Tutorial', creator: 'Physio Plus Fitness' },
    ],
  },
  'hi-band-loop-seated-abduction': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-seated-abduction-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=DU6W5rVb7zA', title: 'How To Do A SEATED BANDED HIP ABDUCTION | Exercise Demonstration Video and Guide', creator: 'Live Lean TV Daily Exercises' },
    ],
  },
  'hi-band-loop-good-morning': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-loop-good-morning-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=_V0WOAL0_k0', title: 'Resistance Band Good Morning', creator: 'Clench Fitness' },
    ],
  },
  'de-band-loop-external-rotation': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-loop-external-rotation-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=lw5jkvrLwVw', title: 'Strengthen Your Rotator Cuff: Shoulder External Rotation with Mini Band', creator: 'Muscle & Motion' },
    ],
  },
  'pl-band-loop-face-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-loop-face-pull-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=IndIttUTNMU', title: 'Face-Pull with a Band', creator: 'Derek Charlebois' },
    ],
  },
  'mob-band-loop-hip-flexor-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-loop-hip-flexor-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=g1sOD9TYrLY', title: 'Banded Hip Flexor Stretch | Movement Demo', creator: 'Vintage CrossFit' },
    ],
  },
  'mob-band-loop-hamstring-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-loop-hamstring-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=0HsJaEIE0bc', title: 'Stretch Tutorial: Lateral Hamstring Stretch With Resistance Band', creator: 'Travis Tarrant' },
    ],
  },
  'sq-band-loop-squat': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-band-loop-squat-form-guide.webp'))],
    clips: [
      { url: 'https://www.youtube.com/watch?v=9CbPyDr2P0w', title: 'Banded Squats - Kinetic U Exercise Series', creator: 'Tangelo - Seattle Chiropractor + Rehab' },
    ],
  },

  'pu-pushup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-pushup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-pushup-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pushups/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-pushup-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pushups/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pushup.webp'),
        license: 'public-domain',
        attribution: 'PFC Charlie Chavez / U.S. Marine Corps',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Marines_do_pushups.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/04FqT6lC0i4',
        title: '✅ Learn the “Perfect” Push-Up',
        creator: 'SaturnoMovement',
      },
      {
        url: 'https://www.youtube.com/watch?v=v9LABVJzv8A',
        title: 'Exercise Library: Push-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'pl-pullup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-pullup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-pullup-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pullups/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-pullup-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pullups/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pullup.webp'),
        license: 'public-domain',
        attribution: 'A1C Zachary Hada / U.S. Air Force',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:U.S._Air_Force_Senior_Airman_Brandon_Stout_performs_pull-ups.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/OEXosPwzFdc',
        title: '✅ Learn the “Perfect” Pull-Up',
        creator: 'SaturnoMovement',
      },
      {
        url: 'https://www.youtube.com/watch?v=aNUSgyWRJYA',
        title: 'How To Do Pull-Ups For Complete Beginners',
        creator: 'FitnessFAQs',
      },
      {
        url: 'https://www.youtube.com/watch?v=Dv3G4WOFG5A',
        title: 'Exercise Library: Pulse-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'sq-bw': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-bw-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-bw-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Bodyweight_Squat/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/sq-bw-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Bodyweight_Squat/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/bodyweight-squat.webp'),
        license: 'public-domain',
        attribution: 'Tech. Sgt. Phillip Butterfield / U.S. Department of Defense',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:160530-F-YI145-049_(27242529600).jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=P-yaD24bUE8',
        title: 'Bodyweight Squat Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'sq-pulse': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-pulse-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7HarjcM6b10',
        title: 'How to Do: Squat Pulses',
        creator: 'Leap Fitness',
      },
    ],
  },
  'sq-jump': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-jump-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=tZSYZdtbONc',
        title: 'How to do a Squat Jump | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
      {
        url: 'https://www.youtube.com/shorts/RhI438LjVl0',
        title: '20 Jump Squats [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'sq-wall-sit': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-wall-sit-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JaZNYM3zAP0',
        title: 'How To Do a Wall Sit | The Right Way',
        creator: 'Well+Good',
      },
    ],
  },
  'sq-sumo-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-sumo-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ksmxuw3JDbQ',
        title: 'Exercise Tutorial: Bodyweight Sumo Squat',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'sq-cossack': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-cossack-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JaCbmoDqUc4',
        title: 'How To Cossack Squat (Beginner to Advanced)',
        creator: 'Flexibility Maestro',
      },
    ],
  },
  'sq-pistol-assisted': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-pistol-assisted-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6pUx2ktKCMQ',
        title: 'Assisted Pistol Squats - Proper Form & Technique',
        creator: 'Steev',
      },
    ],
  },
  'sq-goblet': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-goblet-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-goblet-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Goblet_Squat/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/sq-goblet-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Goblet_Squat/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/0112LhtwAh0',
        title: 'How to Do Goblet Squats With Jennifer Jacobs | Job 1',
        creator: 'BODi',
      },
      {
        url: 'https://www.youtube.com/watch?v=-utXQMqTuVA',
        title: 'Dumbbell Goblet Squat - Proper Form & Technique',
        creator: 'Steev',
      },
    ],
  },
  'sq-db-front': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-db-front-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hZI8Yy5elZs',
        title: 'How to do a Dumbbell Front Squat | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'sq-db-sumo': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-db-sumo-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Sq88Uw0roVU',
        title: 'How to Do a Sumo Squat With Dumbbells',
        creator: 'Openfit on BODi',
      },
    ],
  },
  'sq-db-box': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-db-box-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-box-squat-dumbbell.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Squat_to_bench_with_dumbbells_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=wL9FSf7ZENU',
        title: 'Exercise Tutorial: Dumbbell Box Squat',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'sq-bb-back': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-bb-back-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=8PMjqgR8Wa8',
        title: 'How to Barbell Back Squat | A Tutorial for Beginners',
        creator: 'Barbell Rehab',
      },
    ],
  },
  'sq-bb-front': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-bb-front-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-bb-front-squat.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Front_squat_with_barbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0ect9ETE6t0',
        title: 'How To Properly Do A Barbell Front Squat',
        creator: 'Fit Father Project',
      },
    ],
  },
  'sq-bb-box': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-bb-box-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-box-squat-barbell.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Squat_to_bench_with_barbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=mr27gcM7Slo',
        title: 'Barbell Box Squats - HASfit Squat Exercise Demonstration',
        creator: 'HASfit',
      },
    ],
  },
  'sq-bb-pause': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-bb-pause-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=C8MYeGhmn-U',
        title: 'Barbell Pause Squat',
        creator: 'STRONG ATHLETE',
      },
    ],
  },
  'sq-bb-overhead': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-bb-overhead-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-bb-overhead-squat.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Overhead_squat_with_barbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=MnYmHkI9VIM',
        title: 'How To Do The Overhead Barbell Squat (Perfect Form & Technique)',
        creator: 'OneHowto',
      },
    ],
  },
  'sq-kb-goblet': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-kb-goblet-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=aNDUbH_Uv4g',
        title: 'Kettlebell Goblet Squat (Proper Form & Common Mistakes)',
        creator: 'Zack Henderson',
      },
    ],
  },
  'sq-kb-front': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-kb-front-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6XghYOzny8U',
        title: 'How to Perform the Double Kettlebell Front Squat',
        creator: 'Champion Physical Therapy and Performance',
      },
    ],
  },
  'sq-leg-press-band': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-leg-press-band-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hz__3jNueFg',
        title: 'Resistance Band Exercises - Leg Press',
        creator: 'NeeBooFit',
      },
    ],
  },
  'sq-band-squat': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-band-squat-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=bE97Ietr9aM',
        title: 'Banded Squat | Proper Form Tutorial for Knee & Hip Stability',
        creator: 'FIT.nl',
      },
    ],
  },
  'sq-cable-squat': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-cable-squat-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_C5hMlDZQ6M',
        title: 'How to Properly Do the Cable Goblet Squat',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'sq-box-squat-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-box-squat-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7LpLZOdz68A',
        title: 'Bodyweight Box Squat | Step-by-Step Tutorial',
        creator: 'Physio Plus Fitness',
      },
    ],
  },
  'sq-single-leg-box': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-single-leg-box-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-single-leg-box-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Single-Leg_High_Box_Squat/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/sq-single-leg-box-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Single-Leg_High_Box_Squat/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=3HCztPN3aSk',
        title: 'Exercise Tutorial: Single Leg Box Squat',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'sq-jump-db': {
    stills: [
      formGuide(require('../../../assets/images/exercises/sq-jump-db-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/sq-jump-db-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Weighted_Jump_Squat/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/sq-jump-db-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Weighted_Jump_Squat/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XOTO2qWRy9U',
        title: 'Dumbbell Jump Squat | Exercise Guide',
        creator: 'Bodybuilding.com',
      },
    ],
  },
  'sq-wall-sit-db': {
    stills: [formGuide(require('../../../assets/images/exercises/sq-wall-sit-db-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YGGM_f9Kq1w',
        title: 'Weighted Wall Sits (Exercise Tutorial + Form Tips)',
        creator: 'Team Evolve',
      },
    ],
  },
  'cf-single-leg-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-single-leg-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ElcvJ0kjt6c',
        title: 'Single Leg Calf Raise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'cf-db-standing': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-db-standing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=H6WptvjXkgw',
        title: 'Dumbbell Standing Calf Raises | Calf Exercises Without Machines',
        creator: 'J2FIT Strength & Conditioning',
      },
      {
        url: 'https://www.youtube.com/watch?v=F1QJ6xtesb8',
        title: '30 Calf Raises [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'cf-donkey-bw': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cf-donkey-bw-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/cf-donkey-bw-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Donkey_Calf_Raises/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/cf-donkey-bw-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Donkey_Calf_Raises/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/donkey-calf-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Donkey_calf_raises_1.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Jk_fDd57e98',
        title: 'Donkey Calf Raises Exercise Tutorial',
        creator: 'Buff Dudes Workouts',
      },
    ],
  },
  'wu-flow': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-full-body-flow-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=3qyWpJ34dWw',
        title: '5 Minute Full Body Dynamic Warm-Up Stretch',
        creator: 'Juice & Toya',
      },
    ],
  },
  'wu-jog': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-jog-in-place-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xmkYBO85leM',
        title: 'How To Jog In Place | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'wu-arm-circles': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-arm-circles-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hne3nHGXPRM',
        title: 'Arm Circles (Exercise Library)',
        creator: 'Horton Barbell',
      },
    ],
  },
  'wu-leg-swings': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-leg-swings-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/leg-pendulum-swing.webp'),
        license: 'cc-by-sa',
        attribution: 'BruceBlaus, CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Exercise_Pendulum_Swings.png',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=difYoBtZi2s',
        title: 'How To Do Leg Swings',
        creator: 'PureGym',
      },
      {
        url: 'https://www.youtube.com/shorts/RUYslNUxNwI',
        title: '50 Leg Swings [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'mob-hip': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-hip-mobility-flow-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=WUKHM6-ekJM',
        title: '8-Minute Hip Mobility Routine | Loosen Tight Hips (No Equipment)',
        creator: 'nourishmovelove',
      },
    ],
  },
  'mob-hamstring': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-standing-hamstring-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=B0jl9k3ImKU',
        title: 'Standing Hamstring Stretch Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'mob-shoulder': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-shoulder-circles-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=h8H2fEMlVfI',
        title: 'Shoulder Circles: Mobility Exercise',
        creator: 'MassageNerd',
      },
    ],
  },
  'mob-thoracic': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cat-cow-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nbhJvFWFPTE',
        title: 'How to Do: Thoracic Spine Cat Cow',
        creator: 'Leap Fitness',
      },
    ],
  },
  'mob-neck': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-neck-trap-release-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DwCIZ4YSyd4',
        title: 'Upper Trapezius Stretch for Neck Muscle Knots',
        creator: 'Front Row with Ed and Elizabeth',
      },
    ],
  },
  'mob-ankle': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-ankle-circles-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6XX3R9ibBfw',
        title: 'Ankle Circles to Improve Ankle Mobility',
        creator: 'Rehab My Patient',
      },
      {
        url: 'https://www.youtube.com/watch?v=2Vwfd-Q8MDs',
        title: 'Exercise Library: Raised Leg Circles',
        creator: 'DAREBEE',
      },
    ],
  },
  'mob-wrist': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wrist-circles-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=IJvS9bYl_cs',
        title: 'How to Do Wrist Circles',
        creator: 'Blind Athletes Exercise',
      },
      {
        url: 'https://www.youtube.com/watch?v=jfXcyLTuKP4',
        title: 'Exercise Library: Heel Taps',
        creator: 'DAREBEE',
      },
    ],
  },
  'mob-hip-flexor': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-kneeling-hip-flexor-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6o-GpPIGR5w',
        title: 'Kneeling Hip Flexor Stretch Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'mob-90-90': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-90-90-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=qq_Z7sAmVrA',
        title: '90/90 Hip Switch (Improve Hip Health & Mobility)',
        creator: 'Simone Sports Performance',
      },
    ],
  },
  'mob-pigeon': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-pigeon-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0RQVD6viVXo',
        title: 'How to Correctly Practice Pigeon Pose',
        creator: 'YouAligned',
      },
    ],
  },
  'mob-cobra': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cobra-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YYudWYM5Q9g',
        title: 'How To Do Cobra Pose',
        creator: 'PureGym',
      },
    ],
  },
  'mob-downdog': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-downdog-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ulZr-S0cFOI',
        title: 'How to Do Downward Dog | Proper Form & Technique for Beginners',
        creator: 'Holly Hierman',
      },
    ],
  },
  'mob-quad-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-quad-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=kia2OzZiwqw',
        title: 'Standing Quad Stretch Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'mob-calf-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-calf-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YTYQo4WvJHA',
        title: 'Stretch Tutorial: Standing Calf Stretch On Wall',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'mob-chest-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-chest-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=M850sCj9LHQ',
        title: 'How to Do a Doorway Pec Stretch Exercise | 90 Degrees Abduction',
        creator: 'Medbridge',
      },
    ],
  },
  'mob-lat-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-lat-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=OX5NZLkidtY',
        title: 'Overhead Lat Stretch',
        creator: 'Robbins Rehabilitation Allentown Beth Umac & Bangor',
      },
    ],
  },
  'mob-tricep-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-tricep-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=cPTrm13hSSo',
        title: 'How To Do Overhead Tricep Stretch',
        creator: 'PureGym',
      },
    ],
  },
  'mob-bicep-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wall-biceps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7WiSuaPAorU',
        title: 'A Simple Bicep Stretch Using a Wall',
        creator: 'ProCare Injury Specialists',
      },
    ],
  },
  'mob-groin-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-butterfly-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=QehQaZvvquA',
        title: 'How to Do: Seated Butterfly Stretch',
        creator: 'Leap Fitness',
      },
    ],
  },
  'mob-it-band': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-standing-it-band-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=wzDoSQ8-GWY',
        title: 'IT Band Stretch, Standing',
        creator: 'Ask Doctor Jo',
      },
    ],
  },
  'mob-spinal-twist': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-seated-spinal-twist-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=r5JuFoNzOU8',
        title: 'Seated Spinal Twist Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'mob-scorpion': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-scorpion-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7GjzFFdUnQQ',
        title: 'How To Do a Scorpion Stretch',
        creator: 'Swift Movement Academy',
      },
    ],
  },
  'mob-band-dislocate': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-shoulder-pass-through-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=riVxa9By-pM',
        title: 'How To Do Band Dislocates / Pass-Throughs (Shoulder Mobility)',
        creator: '66 Days Fitness Coaching',
      },
    ],
  },
  'mob-band-hip-distraction': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-band-hip-distraction-v2-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2b3lbYf8SuE',
        title: 'Banded Hip Distraction',
        creator: 'Muscle & Motion',
      },
    ],
  },
  'mob-sphinx': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-sphinx-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=beQs5ChCZ0U',
        title: 'How to do a Sphinx Pose - Stretch Tutorial',
        creator: 'Nine2Fit',
      },
    ],
  },
  'mob-thread-the-needle': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-thread-the-needle-form-guide.webp'))],
  },
  'mob-seated-forward-fold': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-seated-forward-fold-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zWWTdrJulmk',
        title: 'Forward Fold Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'wu-inchworm': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-inchworm-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ml3MdmCkwbQ',
        title: 'Inchworm: How To (3 steps to proper form)',
        creator: 'Born Fitness',
      },
    ],
  },
  'wu-jumping-jack-easy': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-easy-jumping-jacks-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/jumping-jacks.webp'),
        license: 'public-domain',
        attribution: 'MC2 Zack Baddorf / U.S. Navy',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:US_Navy_060114-N-9866B-017_Marines_assigned_to_the_11th_Marine_Expeditionary_Unit_(MEU)_perform_jumping_jacks_on_the_flight_deck_of_the_amphibious_assault_ship_USS_Peleliu_(LHA_5).jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=uLVt6u15L98',
        title: 'How to do a Jumping Jack | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'ca-jumping-jacks': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cardio-jumping-jacks-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/jumping-jacks.webp'),
        license: 'public-domain',
        attribution: 'MC2 Zack Baddorf / U.S. Navy',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:US_Navy_060114-N-9866B-017_Marines_assigned_to_the_11th_Marine_Expeditionary_Unit_(MEU)_perform_jumping_jacks_on_the_flight_deck_of_the_amphibious_assault_ship_USS_Peleliu_(LHA_5).jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=uLVt6u15L98',
        title: 'How to do a Jumping Jack | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'cf-standing-bw': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cf-standing-bw-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/calf-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'BruceBlaus, CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Exercise_Heel_Raise_Two_Legs.png',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=97NbelB5yvQ',
        title: 'How to do Standing Calf Raises: Proper Standing Calf Raise Form',
        creator: 'Canadian Protein',
      },
      {
        url: 'https://www.youtube.com/watch?v=UV8gOrHmuKc',
        title: 'Exercise Library: Calf Raises',
        creator: 'DAREBEE',
      },
    ],
  },
  'cf-seated-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cf-seated-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/cf-seated-bench-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Calf_Raise/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/cf-seated-bench-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Calf_Raise/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/seated-calf-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Seated_calf_raise_with_barbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ORY-ke6vcgk',
        title: 'Seated Calf Raise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-leg-raise': {
    stills: [
      {
        file: require('../../../assets/images/exercises/straight-leg-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'BruceBlaus, CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Exercise_Straight_Leg_Raises.png',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xJJu-WiROM8',
        title: 'How To Perform The Lying Leg Raise Exercise',
        creator: 'Dimitri Giankoulas',
      },
      {
        url: 'https://www.youtube.com/watch?v=9mAcEzUojRg',
        title: '30 Leg Raises [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'bi-db-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-db-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6DeLZ6cbgWQ',
        title: 'How to Perform Standing Dumbbell Bicep Curls',
        creator: 'Chris McCarthy',
      },
    ],
  },
  'fa-db-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-db-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7ac_qmBjkFI',
        title: 'How to Do Dumbbell Wrist Curls',
        creator: 'LIVESTRONG',
      },
    ],
  },
  'yg-mountain': {
    stills: [
      {
        file: require('../../../assets/images/exercises/yoga-mountain-form-guide.webp'),
        license: 'app-original',
        attribution: 'FitnessTrainter original instructional image',
        sourceUrl: 'Generated in-house with OpenAI image generation, August 2026',
        role: 'form-guide',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2HTvZp5rPrg',
        title: 'Mountain Pose (Tadasana) Tutorial',
        creator: 'Yoga Screen',
      },
    ],
  },
  'yg-sun-salutation': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-sun-salutation-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zE369yup5A0',
        title: 'Surya Namaskar . Classic Sun Salutation Tutorial.',
        creator: 'Mandi Suppan',
      },
    ],
  },
  'yg-warrior-1': {
    stills: [
      {
        file: require('../../../assets/images/exercises/yoga-warrior1-form-guide.webp'),
        license: 'app-original',
        attribution: 'FitnessTrainter original instructional image',
        sourceUrl: 'Generated in-house with OpenAI image generation, August 2026',
        role: 'form-guide',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=NjD0bTgRxIs',
        title: 'How to Do Warrior 1 Pose',
        creator: "DICK'S",
      },
    ],
  },
  'yg-warrior-2': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-warrior2-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=dW231uCUvyg',
        title: 'Warrior 2 Yoga Pose for Beginners (Learn Correct Alignment!)',
        creator: 'YYOGA at Home',
      },
    ],
  },
  'yg-reverse-warrior': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-reverse-warrior-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=h_iHFVf-1J4',
        title: 'How To Do Reverse Warrior Pose with Perfect Alignment',
        creator: 'Yoga International',
      },
    ],
  },
  'yg-triangle': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-triangle-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Op72srvfIXM',
        title: 'How to do Triangle Pose (Trikonasana) | Step by Step | Iyengar Yoga',
        creator: 'Heather Kitchen Yoga',
      },
    ],
  },
  'yg-extended-side-angle': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-side-angle-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0k0A_N_FA7k',
        title: 'How to Do Extended Side Angle Pose',
        creator: "DICK'S",
      },
    ],
  },
  'yg-tree': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-tree-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=bcwq1qeybWs',
        title: 'How To Do Tree Pose Correctly',
        creator: 'Di Hickman',
      },
    ],
  },
  'yg-chair': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-chair-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=UEsSjeq5B18',
        title: 'Chair Pose (Utkatasana) Yoga Pose Tutorial',
        creator: 'High Desert Yogi',
      },
    ],
  },
  'yg-eagle': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-eagle-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=oZAG1NMr3-I',
        title: 'How to do Eagle Pose (Garudasana) - Yoga Tutorial',
        creator: 'Yoga Upload with Maris Aylward',
      },
    ],
  },
  'yg-half-moon': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-halfmoon-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=EriPRTk1ly0',
        title: 'Half Moon Pose - Foundations of Yoga',
        creator: 'Yoga With Adriene',
      },
    ],
  },
  'yg-bridge': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-bridge-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XMHf6FUGSmk',
        title: 'How to Do Bridge Pose (Setu Bandhasana) - Yoga Tutorial',
        creator: 'Yoga Upload with Maris Aylward',
      },
    ],
  },
  'yg-boat': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-boat-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=972i40ShAm0',
        title: 'How to do Boat Pose - Navasana | Iyengar Yoga',
        creator: 'Heather Kitchen Yoga',
      },
    ],
  },
  'yg-locust': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-locust-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=v-h-nVkxJBY',
        title: "How to do Salabhasana | Locust Pose | Benefits & Beginner's Guide",
        creator: 'MyYogaTeacher',
      },
    ],
  },
  'yg-camel': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-camel-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hm0TJfe0oIg',
        title: 'How to Do Camel Pose (Ustrasana) | YogaRenew Backbend Tutorial',
        creator: 'YogaRenew',
      },
    ],
  },
  'yg-fish': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-fish-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DEMd1dJTEpg',
        title: 'How To: Fish Pose (Matsyasana) | Tips & Modifications',
        creator: 'Black Yogi Nico Marie',
      },
    ],
  },
  'yg-legs-up-wall': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-legs-up-wall-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xmcDj4Bf--0',
        title: 'How to do Legs Up the Wall - Viparita Karani',
        creator: 'Yoga & You',
      },
    ],
  },
  'yg-final-relaxation': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-relaxation-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=w7cGoJwUTkc',
        title: '10-Min Final Relaxation Yoga | Guided Relaxation in Savasana / Corpse Pose',
        creator: 'Yin Yoga with Katie',
      },
    ],
  },
  'fr-calves': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-calves-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_1CagXeazig',
        title: 'The RIGHT Way To Foam Roll Your Calves',
        creator: 'Rehab and Revive',
      },
    ],
  },
  'fr-quads': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-quads-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7FoLY0EgdqI',
        title: 'The RIGHT Way To Foam Roll Your Quads',
        creator: 'Rehab and Revive',
      },
    ],
  },
  'fr-hamstrings': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-hamstrings-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=jV9SSJ3OkcA',
        title: "Foam Rolling Hamstrings: Dos, Don'ts & How To",
        creator: 'Sports Injury Physio',
      },
    ],
  },
  'fr-glutes': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-glutes-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=4sJtt9c55MI',
        title: 'How to Properly Release Your Glutes on the Foam Roller',
        creator: 'Physio REHAB',
      },
    ],
  },
  'fr-lats': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-lats-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=aaoVNwkYi1s',
        title: 'How to Foam Roll the Lats (Latissimus Dorsi)',
        creator: 'All Strength Training',
      },
    ],
  },
  'fr-upper-back': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-upper-back-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=X8P9KSaYOkE',
        title: 'How to Foam Roll Your Upper-Back to Melt Tension Away',
        creator: 'Well+Good',
      },
    ],
  },
  'fr-it-band': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-it-band-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Xl_L0o5N0bw',
        title: 'How To Foam Roll Your IT Band The Right Way',
        creator: 'Tone and Tighten',
      },
    ],
  },
  'fr-adductors': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-adductors-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hSxQuAYlPrE',
        title: 'How to Foam Roll Your Inner Thigh (Adductor Muscles)',
        creator: 'Upright Health',
      },
    ],
  },
  'hi-rdl-db': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-rdl-db-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/hu3jRvTc_po',
        title: 'The PERFECT Dumbbell Romanian Deadlift',
        creator: 'Andrew Kwong (DeltaBolic)',
      },
      {
        url: 'https://www.youtube.com/watch?v=aa57T45iFSE',
        title: 'How to do a Dumbbell Romanian Deadlift | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'hi-hip-bridge': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-hip-bridge-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hinge-hip-bridge.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bridging_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/R1OXPHRqehw',
        title: 'How to do a glute bridge.',
        creator: 'Cleveland Clinic',
      },
      {
        url: 'https://www.youtube.com/watch?v=wPM8icPu6H8',
        title: 'How To Do A Glute Bridge | The Right Way',
        creator: 'Well+Good',
      },
    ],
  },
  'hi-single-leg-bridge': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-single-leg-bridge-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hi-single-leg-bridge-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Single_Leg_Glute_Bridge/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/hi-single-leg-bridge-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Single_Leg_Glute_Bridge/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=VUl8R0kn6v4',
        title: 'Single Leg Glute Bridge Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/shorts/84_w6Ox0ntA',
        title: '20 Single Leg Bridges [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'hi-db-deadlift': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-db-deadlift-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hinge-db-deadlift.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dumbbell_dead_lifts_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Ipi8_vz8_z0',
        title: 'Dumbbell Deadlift Technique – Perfect Form Video Tutorial Guide',
        creator: 'Fit Father Project',
      },
    ],
  },
  'hi-db-sumo-deadlift': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-db-sumo-deadlift-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xgb_WrJ_xtw',
        title: 'Proper Dumbbell Sumo Deadlift Form and Technique',
        creator: 'Chris Gates Fitness',
      },
    ],
  },
  'hi-db-single-rdl': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-db-single-rdl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=18CzQrq-Z7I',
        title: 'How to Do a Single-Leg Dumbbell RDL',
        creator: 'Patience Consistency',
      },
    ],
  },
  'hi-db-good-morning': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-db-good-morning-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7mrKMteISXs',
        title: 'How To Do A Dumbbell Good Morning',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'hi-db-staggered-rdl': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-db-staggered-rdl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Li9jJhbSxBA',
        title: 'Staggered Stance RDLs Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'hi-bb-deadlift': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-bb-deadlift-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hi-bb-deadlift-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Deadlift/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/hi-bb-deadlift-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Deadlift/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/hinge-bb-deadlift.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Barbell_dead_lifts_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/7YYaGXvEr90',
        title: 'Deadlift With PERFECT Form!',
        creator: 'Squat University',
      },
      {
        url: 'https://www.youtube.com/watch?v=NVpwlMFrB3I',
        title: 'How to Do the Barbell Deadlift | Master Your Form for Strength & Safety',
        creator: 'Physio Plus Fitness',
      },
    ],
  },
  'hi-bb-sumo-deadlift': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-bb-sumo-deadlift-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JbY72Him34Q',
        title: 'How To Correctly Perform A Sumo Deadlift',
        creator: 'PureGym',
      },
    ],
  },
  'hi-bb-rdl': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-bb-rdl-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hinge-bb-rdl.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Romanian_dead_lift_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xgusDooVfKU',
        title: 'How to do a Romanian Deadlift (Barbell) | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'hi-bb-good-morning': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-bb-good-morning-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hinge-bb-good-morning.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Barbell_good_mornings_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=f23vXjoG2e8',
        title: 'How to Do the Good Morning Exercise',
        creator: 'Jeff Nippard',
      },
    ],
  },
  'hi-bb-rack-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-bb-rack-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Y99s0dNWpUw',
        title: 'How To Do Rack Pulls',
        creator: 'nutritioneering',
      },
    ],
  },
  'hi-kb-deadlift': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-kb-deadlift-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=MJPGkNqAXzg',
        title: 'How to Do a Kettlebell Deadlift | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'hi-kb-swing': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-kb-swing-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/kettlebell-swing.webp'),
        license: 'cc-by-sa',
        attribution: 'Taco fleur, CC BY-SA 4.0',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:Kettlebell_swing_with_arms_extended_upon_back_swing.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/aSYap2yhW8s',
        title: 'The BEST Kettlebell Swing Tutorial',
        creator: 'Squat University',
      },
      {
        url: 'https://www.youtube.com/watch?v=sSESeQAir2M',
        title: 'How To Do A Kettlebell Swing | The Right Way',
        creator: 'Well+Good',
      },
    ],
  },
  'hi-kb-single-arm-swing': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-kb-single-arm-swing-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hi-kb-single-arm-swing-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Kettlebell_Swings/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/hi-kb-single-arm-swing-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Kettlebell_Swings/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ANjKto7aSH0',
        title: 'Single Arm Kettlebell Swing Tutorial | Proper Form & Step-by-Step Progressions',
        creator: 'Brittany van Schravendijk',
      },
    ],
  },
  'hi-kb-single-rdl': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-kb-single-rdl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Nenu2LI9_dw',
        title: 'How to do Single Leg RDL with Kettlebell (Romanian Deadlift)',
        creator: 'Criticalbench',
      },
    ],
  },
  'hi-kb-sumo-deadlift': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-kb-sumo-deadlift-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=sGNMEtZCkRY',
        title: 'How To: Kettlebell Sumo Deadlift',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'hi-bw-good-morning': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-bw-good-morning-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=61zbhuRiwQg',
        title: 'Bodyweight Good Mornings (Exercise Library)',
        creator: 'Horton Barbell',
      },
    ],
  },
  'hi-band-deadlift': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-deadlift-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DzgMIPH9_sw',
        title: 'How To Do Deadlift With Resistance Band (Perfect Form)',
        creator: 'Fitness My Life',
      },
    ],
  },
  'hi-band-good-morning': {
    stills: [
      formGuide(require('../../../assets/images/exercises/hi-band-good-morning-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/hi-band-good-morning-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Band_Good_Morning/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/hi-band-good-morning-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Band_Good_Morning/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=fJA39ZOVaEQ',
        title: 'How To Do Banded Good Mornings',
        creator: 'Rogue Fitness',
      },
    ],
  },
  'hi-band-hip-thrust': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-band-hip-thrust-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CaepDtuABlQ',
        title: 'How To Do a Band Hip Thrust',
        creator: 'Girls Gone Strong',
      },
    ],
  },
  'hi-hip-thrust-bench': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-hip-thrust-bench-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=pF17m_CXfL0',
        title: 'Hip Thrust Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'hi-single-leg-hip-thrust': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-single-leg-hip-thrust-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DdXdKrpPtTo',
        title: 'Single-Leg Hip Thrust',
        creator: 'Elite Performance Institute',
      },
    ],
  },
  'hi-cable-pull-through': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-cable-pull-through-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=yXopOhzEoeo',
        title: 'How to Properly Perform a Glute Pull Through',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'lu-forward-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-forward-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/zriYMBKtgbI',
        title: 'Lunges: Fitness Fridays #shorts',
        creator: 'Duke Health',
      },
      {
        url: 'https://www.youtube.com/watch?v=g8-Ge9S0aUw',
        title: 'How To Do A Forward Lunge',
        creator: 'PureGym',
      },
      {
        url: 'https://www.youtube.com/watch?v=UpyDdQjBTa0',
        title: 'Exercise Library: Lunges',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-reverse-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-reverse-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=HXs8u1251ss',
        title: 'Reverse Bodyweight Lunge Exercise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/watch?v=-Q_2HR5OhEY',
        title: 'Exercise Library: Reverse Lunges',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-walking-bw': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-walking-bw-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/walking-lunge-bw.webp'),
        license: 'public-domain',
        attribution: 'MC2 Derek A. Harkins / U.S. Navy',
        sourceUrl:
          'https://commons.wikimedia.org/wiki/File:U.S._Navy_Logistics_Specialist_3rd_Class_Andrew_Lee_performs_lunges_during_command_physical_training_in_the_hangar_bay_aboard_the_aircraft_carrier_USS_Nimitz_(CVN_68)_in_the_Pacific_Ocean_April_8,_2013_130408-N-TW634-226.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=vYfp2t4XgqQ',
        title: 'Walking Lunge Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'lu-lateral-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-lateral-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=sGZn1_WK6gc',
        title: 'Lateral Lunge Body Weight Exercise - How to do a Side Lunge',
        creator: 'Criticalbench',
      },
      {
        url: 'https://www.youtube.com/shorts/z8Nl5Rbvc1I',
        title: '20 Split Lunges [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-curtsy-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-curtsy-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=rUD0rPjlxdQ',
        title: 'Bodyweight Curtsy Lunge',
        creator: 'Latitude 32 Fitness',
      },
      {
        url: 'https://www.youtube.com/watch?v=UhaCe9GdO6A',
        title: '20 Tap Side Lunges [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-step-up-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-step-up-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=vOiHvzj5XhA',
        title: 'Step Up Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/watch?v=KM6-6xTRpow',
        title: 'Exercise Library: Lunge Step-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-bulgarian-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-bulgarian-bw-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=yewlXtRs3K4',
        title: 'How To Do a Bulgarian Split Squat | Proper Form + Common Mistakes',
        creator: 'Vicky Justiz',
      },
    ],
  },
  'lu-jump-lunge': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-jump-lunge-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_5kDxC0flg0',
        title: 'How to do a Lunge Jump | Proper Form & Technique',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
      {
        url: 'https://www.youtube.com/watch?v=Kq5lZ4o26Ho',
        title: 'Exercise Library: Jumping Lunges',
        creator: 'DAREBEE',
      },
    ],
  },
  'lu-db-forward': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-db-forward-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=3TM-vVWuLYE',
        title: 'How To Do A Dumbbell Forward Lunge',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'lu-db-reverse': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-db-reverse-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/lu-db-reverse-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Rear_Lunge/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/lu-db-reverse-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Rear_Lunge/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=RZKXLMxPF_I',
        title: 'Dumbbell Reverse Lunges | How To | Proper Form & Technique',
        creator: 'FITTR',
      },
    ],
  },
  'lu-db-walking': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-db-walking-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/lunge-db-walking.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Walking_lunges_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=I34ysEkPK7w',
        title: 'Dumbbell Walking Lunge - How To',
        creator: 'Bobby Maximus',
      },
    ],
  },
  'lu-db-lateral': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-db-lateral-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=R8jArZG2J6Q',
        title: 'How To Do A Dumbbell Lateral Lunge',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'lu-db-bulgarian': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-db-bulgarian-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=vLuhN_glFZ8',
        title: 'Dumbbell Bulgarian Split Squat (Full Tutorial)',
        creator: 'J2FIT Strength & Conditioning',
      },
    ],
  },
  'lu-db-step-up': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-db-step-up-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/lu-db-step-up-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Step_Ups/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/lu-db-step-up-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Step_Ups/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/lunge-db-step-up.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Step_ups_with_dumbbells_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DxUNi119Qzs',
        title: 'How To Do A Dumbbell Step Up',
        creator: 'PureGym',
      },
    ],
  },
  'lu-db-curtsy': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-db-curtsy-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=C6gq15ulRQU',
        title: 'Dumbbell Curtsy Lunge',
        creator: 'FITASTIC',
      },
    ],
  },
  'lu-bb-walking': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-bb-walking-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/lu-bb-walking-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Walking_Lunge/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/lu-bb-walking-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Walking_Lunge/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=X9QswJmhBQI',
        title: 'Barbell Walking Lunges',
        creator: 'Testosterone Nation',
      },
    ],
  },
  'lu-bb-reverse': {
    stills: [
      formGuide(require('../../../assets/images/exercises/lu-bb-reverse-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/lunge-bb-reverse.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Rear_lunges_with_barbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=sb1GbA4Dp04',
        title: 'Barbell Reverse Lunge Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'lu-bb-bulgarian': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-bb-bulgarian-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=obUobGzBRUY',
        title: 'Barbell Bulgarian Split Squat',
        creator: 'Torokhtiy Weightlifting Library',
      },
    ],
  },
  'lu-kb-reverse': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-kb-reverse-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2D4xApe-UFU',
        title: 'How to Perform the Kettlebell Reverse Lunge',
        creator: 'Greg Brookes',
      },
    ],
  },
  'lu-kb-lateral': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-kb-lateral-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=OLyBsmkkn-8',
        title: 'How to Perform the Kettlebell Side Lunge',
        creator: 'Greg Brookes',
      },
    ],
  },
  'lu-kb-step-up': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-kb-step-up-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=NGDPf5OIc1M',
        title: 'Kettlebell Step Up',
        creator: 'OPEX Fitness',
      },
    ],
  },
  'lu-kb-curtsy': {
    stills: [formGuide(require('../../../assets/images/exercises/lu-kb-curtsy-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DEE806Xr4V4',
        title: 'Kettlebell Curtsy Lunge',
        creator: 'Testosterone Nation',
      },
    ],
  },
  'pu-incline-pushup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-incline-pushup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-incline-pushup-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Incline_Push-Up/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-incline-pushup-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Incline_Push-Up/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0JUrOH--Kdk',
        title: 'How to do an Incline Push-Up | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
      {
        url: 'https://www.youtube.com/watch?v=XA8T_bHHkl0',
        title: 'Exercise Library: Raised Leg Push-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'pu-decline-pushup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-decline-pushup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-decline-pushup-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Decline_Push-Up/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-decline-pushup-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Decline_Push-Up/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/push-decline-pushup.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Push_up_feet_elevated_2_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DBz85WuXqMk',
        title: 'How to do a Decline Push-Up | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-diamond-pushup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-diamond-pushup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-diamond-pushup.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Close_triceps_pushup_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=kGhDnFwMY3E',
        title: 'Diamond Push Ups For Beginners | Proper Form & Progression',
        creator: 'Minus The Gym',
      },
      {
        url: 'https://www.youtube.com/watch?v=GEoIeLLBD20',
        title: 'Diamond Push-ups (Exercise Library)',
        creator: 'DAREBEE',
      },
    ],
  },
  'pu-wide-pushup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-wide-pushup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-wide-pushup.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Push_ups_close_and_wide_hand_versions_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=rr6eFNNDQdU',
        title: 'How to Do a Wide Grip Push-Up | Chest Workout',
        creator: 'Howcast',
      },
      {
        url: 'https://www.youtube.com/watch?v=1Y8pTxdwf3M',
        title: 'Exercise Library: Push-Ups / Wide Grip',
        creator: 'DAREBEE',
      },
    ],
  },
  'pu-pike-pushup': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-pike-pushup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=pHR5yG6xBps',
        title: 'Pike Push Up Tutorial For Beginners (With Progressions)',
        creator: 'Gymless Fitness',
      },
    ],
  },
  'pu-archer-pushup': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-archer-pushup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=L109Ad4zCR4',
        title: 'Archer Push Ups Tutorial With Correct Form | (3 Variations Covered)',
        creator: 'Gymless Fitness',
      },
    ],
  },
  'pu-plyo-pushup': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-plyo-pushup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=MH4gcTKQiEc',
        title: 'How to do a Plyometric Push-Up | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-bench-dip': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-bench-dip-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-bench-dip-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Bench_Dips/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-bench-dip-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Bench_Dips/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/push-bench-dip.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bench_dips_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=WVeZDBhZwLA',
        title: 'How to do a Bench Dip | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-db-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-db-bench-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Bench_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-db-bench-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Bench_Press/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/push-db-bench.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bench_press_dumbbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/1V3vpcaxRYQ',
        title: 'Best Dumbbell Bench Press Tutorial Ever Made',
        creator: 'Davis Diley',
      },
      {
        url: 'https://www.youtube.com/watch?v=xhEhjF5ozuY',
        title: 'Dumbbell Bench Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-db-incline-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-incline-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-incline-bench.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dumbbell_incline_bench_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=sK4Rvug6ufo',
        title: 'Incline Dumbbell Bench Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-db-floor-press': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-floor-press-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-db-floor-press-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Floor_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-db-floor-press-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Floor_Press/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=vagdk94bFn4',
        title: 'Floor Dumbbell Bench Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-db-ohp': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-ohp-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-ohp.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dumbbell_shoulder_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/qLZU6Fl2sI4',
        title: 'STANDING DUMBBELL SHOULDER PRESS TUTORIAL 💪🏼 // Build your shoulders using a pair of dumbbells!',
        creator: 'KevTheTrainer',
      },
      {
        url: 'https://www.youtube.com/watch?v=XOFmNo9F-JQ',
        title: 'Dumbbell Overhead Press | Proper Form & Technique Guide',
        creator: 'Muscle Flex',
      },
    ],
  },
  'pu-db-seated-ohp': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-seated-ohp-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-db-seated-ohp-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Dumbbell_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-db-seated-ohp-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Dumbbell_Press/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=s_aK83TWYkA',
        title: 'Perfect Your Seated Dumbbell Overhead Press | Tips for Perfect Form and Shoulder Gains',
        creator: 'MuscleWiki',
      },
    ],
  },
  'pu-db-arnold-press': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-arnold-press-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-arnold-press.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Arnold_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=TEzehbTzBD0',
        title: 'Dumbbell Arnold Press | How To | Proper Form & Technique',
        creator: 'FITTR',
      },
    ],
  },
  'pu-db-single-arm-press': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-single-arm-press-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-single-arm-press.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:One_arm_dumbbell_shoulder_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=L9VlR9yq904',
        title: 'Standing Single Arm Shoulder Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-db-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dumbbell_flys_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=98aRvyw-IGg',
        title: 'Dumbbell Chest Fly Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-db-incline-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-db-incline-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-db-incline-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Incline_dumbbell_flys_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=idAvu2HvqSQ',
        title: 'HOW TO: Incline Dumbbell Fly || PERFECT FORM (GROWTH & STRENGTH)',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'pu-db-neutral-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-db-neutral-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=fZuQpjhaR_M',
        title: 'How To Do A Neutral Grip Dumbbell Press',
        creator: 'PureGym',
      },
    ],
  },
  'pu-bb-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-bb-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-bb-bench.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bench_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Pp8rHcFVIYg',
        title: 'Barbell Bench Press – Proper Form Tutorial (Beginner Friendly)',
        creator: '6th Pillar Coaching',
      },
    ],
  },
  'pu-bb-incline-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-bb-incline-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-bb-incline-bench.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Incline_bench_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=O9x7xRhtA9Q',
        title: 'Incline Barbell Bench Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-bb-ohp': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-bb-ohp-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-bb-ohp.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Barbell_shoulder_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=a81SaIpjGlA',
        title: 'Overhead Press (Barbell) - Proper Form & Technique [4K]',
        creator: 'Steev',
      },
    ],
  },
  'pu-bb-push-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-bb-push-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Hqxjk5Z35SM',
        title: 'Push Press Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pu-bb-close-grip-bench': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-bb-close-grip-bench-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-bb-close-grip-bench.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Close_grip_barbell_bench_press_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=UYJsFzqdgK4',
        title: 'HOW TO: Close-Grip Bench Press (TRICEPS BUILDER) || PERFECT FORM',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'pu-bb-floor-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-bb-floor-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gacJl2rHwtg',
        title: 'How To Do The Barbell FLOOR PRESS',
        creator: 'SET FOR SET',
      },
    ],
  },
  'pu-cable-chest-press': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-cable-chest-press-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-cable-chest-press-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Chest_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-cable-chest-press-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Chest_Press/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=FVWJglwid4I',
        title: 'How to Do a Cable Chest Press | Chest Workout',
        creator: 'Howcast',
      },
    ],
  },
  'pu-cable-incline-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-cable-incline-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=qctZmqNhkfU',
        title: 'Incline Cable Chest Press - HASfit Upper Chest Exercise Demonstration - Incline Cable Bench Press',
        creator: 'HASfit',
      },
    ],
  },
  'pu-cable-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-cable-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/push-cable-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Cable_crossover_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XNf6TBErGys',
        title: 'How to do a Two-Arm Standing Cable Fly | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-cable-ohp': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-cable-ohp-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7LVUvRVexo8',
        title: 'Cable Overhead Press',
        creator: 'Steph Dorworth',
      },
    ],
  },
  'pu-cable-single-arm-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-cable-single-arm-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=D9e8ZBlFPBw',
        title: 'How to do the Single Arm Cable Chest Press for Crazy Chest Pumps',
        creator: 'Seriously Strong Training',
      },
    ],
  },
  'pu-cable-low-to-high-fly': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-cable-low-to-high-fly-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=eQ_NBB6OBH4',
        title: 'HOW TO: Chest "Low-To-High" Cable Fly (BIGGER UPPER CHEST) || PERFECT FORM',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'pu-band-chest-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-band-chest-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=9NGo4lZd65o',
        title: 'Banded Chest Press',
        creator: 'RADCENTRE',
      },
    ],
  },
  'pu-band-ohp': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-band-ohp-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=SoKGZpyXUMY',
        title: 'How To Do An Overhead Press With A Resistance Band | The Right Way | Well+Good',
        creator: 'Well+Good',
      },
    ],
  },
  'pu-kb-floor-press': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pu-kb-floor-press-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pu-kb-floor-press-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Kettlebell_Floor_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pu-kb-floor-press-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Kettlebell_Floor_Press/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=i_URJN83nys',
        title: 'The Kettlebell Floor Press',
        creator: 'CrossFit',
      },
    ],
  },
  'pu-kb-ohp': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-kb-ohp-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=X-uFqWtjpGI',
        title: 'How to do a Kettlebell Overhead Press',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-kb-push-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-kb-push-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=k4q6HkT99iA',
        title: 'How to do a Kettlebell Push Press',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pu-landmine-press': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-landmine-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=3gYz0bLG-wY',
        title: 'Proper Technique for The Landmine Press',
        creator: 'Simone Sports Performance',
      },
    ],
  },
  'tr-cable-pushdown': {
    stills: [
      formGuide(require('../../../assets/images/exercises/tr-cable-pushdown-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/tr-cable-pushdown-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Triceps_Pushdown/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/tr-cable-pushdown-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Triceps_Pushdown/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/tricep-cable-pushdown.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Triceps_pushdown_with_cable_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_w-HpW70nSQ',
        title: 'HOW TO: Cable Triceps Pushdown || 3 Golden Rules (FOR GROWTH)',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'tr-band-pushdown': {
    stills: [formGuide(require('../../../assets/images/exercises/tr-band-pushdown-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=qjPN6ElNqpc',
        title: 'How To Do Banded Tricep Pushdowns',
        creator: 'Rogue Fitness',
      },
    ],
  },
  'tr-db-overhead-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/tr-db-overhead-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=X-iV-cG8cYs',
        title: 'How To PROPERLY Overhead Dumbbell Tricep Extension | 3 Muscle Gain Variations',
        creator: 'Colossus Fitness',
      },
      {
        url: 'https://www.youtube.com/watch?v=iB7yiRWh76A',
        title: '5 Cross Tricep Extensions [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'tr-db-skull-crusher': {
    stills: [
      formGuide(require('../../../assets/images/exercises/tr-db-skull-crusher-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/tricep-db-skull-crusher.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lying_triceps_extension_with_dumbbells_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=FzjBUeUf1L0',
        title: 'Dumbbell Skull Crushers | How To | Proper Form & Technique',
        creator: 'FITTR',
      },
    ],
  },
  'tr-db-kickback': {
    stills: [
      formGuide(require('../../../assets/images/exercises/tr-db-kickback-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/tricep-db-kickback.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Triceps_kickback_with_dumbbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=m9me06UBPKc',
        title: 'How to Perform Dumbbell Triceps Kickback Exercise',
        creator: 'Buff Dudes',
      },
    ],
  },
  'de-db-lateral-raise': {
    stills: [
      formGuide(require('../../../assets/images/exercises/de-db-lateral-raise-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/delt-db-lateral-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Lateral_dumbbell_raises_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nnH63icHYXY',
        title: 'Dumbbell Lateral Raise | Proper Form Tutorial for Bigger Shoulders',
        creator: 'FIT.nl',
      },
    ],
  },
  'de-db-front-raise': {
    stills: [
      formGuide(require('../../../assets/images/exercises/de-db-front-raise-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/de-db-front-raise-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Raise/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/de-db-front-raise-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Raise/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/delt-db-front-raise.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Front_dumbbell_raise_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CH9JzDStL3U',
        title: 'How to Do Dumbbell Front Raises | Proper Form & Tips',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'de-cable-lateral-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/de-cable-lateral-raise-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zpbm-xRHB6k',
        title: 'Cable Lateral Raise | Proper Form Tutorial for Bigger Shoulders',
        creator: 'FIT.nl',
      },
    ],
  },
  'de-band-lateral-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-lateral-raise-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gfEyrmxbCbw',
        title: 'How To: Resistance Band Lateral Raise',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'de-db-rear-delt-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/de-db-rear-delt-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/delt-db-rear-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bent_over_rear_deltoid_raise_with_head_on_bench_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hwBu73GZn98',
        title: 'How To Do Rear Delt Flys With Dumbbells - Proper Form, Sets & Reps',
        creator: 'Fit Father Project - Fitness For Busy Fathers',
      },
    ],
  },
  'de-band-front-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/de-band-front-raise-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=mPNvwT0Lq04',
        title: 'How to Do Band Front Raise - Exercise Tutorial',
        creator: 'Coach Haris',
      },
    ],
  },
  'pl-db-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/R8y16opVx9c',
        title: 'Form Review for the Bent Over Row',
        creator: 'FitnessBlender',
      },
      {
        url: 'https://www.youtube.com/watch?v=knB5Q4FN4ck',
        title: 'Bent-Over Dumbbell Row',
        creator: 'Testosterone Nation',
      },
    ],
  },
  'pl-band-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=TBNt2DBvkl4',
        title: 'How To: Resistance Band Seated Row',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'pl-chinup': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-chinup-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-chinup-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Chin-Up/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-chinup-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Chin-Up/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-chinup.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Chin_ups_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=53kV7Ou7oZo',
        title: 'How to Do Chin Ups',
        creator: 'Your House Fitness',
      },
    ],
  },
  'pl-wide-pullup': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-wide-pullup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=9A6NPVPzkqQ',
        title: 'How to Do Wide Grip Pullups | Perfect Form in 30 Seconds',
        creator: 'All Strength Training',
      },
    ],
  },
  'pl-neutral-pullup': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-neutral-pullup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=cd_38C6LuvY',
        title: 'Neutral Grip Pull-Up',
        creator: 'OPEX Fitness',
      },
    ],
  },
  'pl-negative-pullup': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-negative-pullup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gbPURTSxQLY',
        title: 'How To Do a Negative Pull-Up | Exercise Guide',
        creator: 'Bodybuilding.com',
      },
    ],
  },
  'pl-commando-pullup': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-commando-pullup-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nxuS98hb3B4',
        title: 'Commando Pull Up - Proper Form & Technique [4K]',
        creator: 'Steev',
      },
    ],
  },
  'pl-inverted-row': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-inverted-row-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-inverted-row-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Inverted_Row/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-inverted-row-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Inverted_Row/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-inverted-row.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Body_row_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Fl0UMfdEzsE',
        title: 'Inverted Rows (Beginner to Advanced Progressions)',
        creator: 'Zack Henderson',
      },
    ],
  },
  'pl-table-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-table-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7mNiAdNdcZs',
        title: 'How to Do a Table Row',
        creator: 'Jack W.',
      },
    ],
  },
  'pl-doorframe-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-doorframe-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=g8wWFlr2gQU',
        title: 'Bodyweight Door Rows',
        creator: 'Hardstyle Kettlebell Pro',
      },
    ],
  },
  'pl-prone-y-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-prone-y-raise-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=w1AWGKubE5U',
        title: 'Prone Y Raise',
        creator: 'Performance Course',
      },
    ],
  },
  'pl-hanging-scap-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-hanging-scap-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=1I9JZz8iNFA',
        title: 'Hanging Scapular Pull Ups Tutorial',
        creator: 'Dr. Sara Solomon',
      },
    ],
  },
  'pl-db-single-arm-row': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-db-single-arm-row-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-db-single-arm-row-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Dumbbell_Row/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-db-single-arm-row-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/One-Arm_Dumbbell_Row/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nMFCMNKnLgQ',
        title: 'How to Perform Single Arm Dumbbell Rows | Back Size Exercise Tutorial',
        creator: 'Buff Dudes Workouts',
      },
    ],
  },
  'pl-db-renegade-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-renegade-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=F68p7cJFtOI',
        title: 'How to do Renegade Rows (Core & Back Strength) | Proper Form Renegade Row Exercise Tutorial',
        creator: 'Studio SWEAT onDemand',
      },
    ],
  },
  'pl-db-reverse-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-db-reverse-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/delt-db-rear-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bent_over_rear_deltoid_raise_with_head_on_bench_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=buuYPLVXsJg',
        title: 'How to PROPERLY Dumbbell Rear Delt Fly | Reverse Dumbbell Fly Tutorial',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'pl-db-shrug': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-db-shrug-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-db-shrug-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Shrug/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-db-shrug-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Shrug/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-db-shrug.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Dumbbell-shrugs-2.png',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=cJRVVxmytaM',
        title: 'How To: Dumbbell Shrugs',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'pl-db-high-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-high-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2oq8CDNM8ww',
        title: 'How to Do Dumbbell High Pulls | Movement Breakdown',
        creator: 'LivingFit',
      },
    ],
  },
  'pl-db-chest-supported-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-chest-supported-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_b6ch2nIchk',
        title: 'How To Do The Chest Supported Dumbbell Row Correctly - Proper Form, Sets & Reps Tutorial',
        creator: 'Fit Father Project - Fitness For Busy Fathers',
      },
    ],
  },
  'pl-db-incline-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-incline-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=tvk5Fb2K0Ns',
        title: 'How To Do a Dumbbell Incline Bench Row',
        creator: 'Swift Movement Academy',
      },
    ],
  },
  'pl-bb-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-bb-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=rqTOAM8WoeM',
        title: 'Barbell Bent Over Row Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'pl-bb-pendlay-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-bb-pendlay-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=C_p-s66KBpg',
        title: 'How to Perform a Pendlay Row',
        creator: 'The Physio Fix',
      },
    ],
  },
  'pl-bb-shrug': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-bb-shrug-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-bb-shrug-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Shrug/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-bb-shrug-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Barbell_Shrug/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-bb-shrug.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Barbell_shrugs_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=KbsQ1E8Hg0o',
        title: 'How To Perform The Barbell Shrug With Perfect Technique | Myprotein',
        creator: 'Myprotein',
      },
    ],
  },
  'pl-bb-upright-row': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-bb-upright-row-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-bb-upright-row.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Upright_barbell_rows_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=jaAV-rD45I0',
        title: 'How To Perform the Upright Row - Exercise Tutorial',
        creator: 'Buff Dudes',
      },
    ],
  },
  'pl-bb-high-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-bb-high-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=y9d3jCocliI',
        title: 'Barbell High Pulls',
        creator: 'FlexWell',
      },
    ],
  },
  'pl-bb-landmine-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-bb-landmine-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=tiETx7VNDf0',
        title: 'Landmine Single Arm Row',
        creator: 'TrainFTW',
      },
    ],
  },
  'pl-cable-row': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-cable-row-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-cable-row-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Cable_Rows/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-cable-row-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Seated_Cable_Rows/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-cable-row.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Seated_cable_rows_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=7BkgqzC6WsM',
        title: 'How to PROPERLY Seated Cable Row (DO THIS NOW)',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'pl-lat-pulldown': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-lat-pulldown-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-lat-pulldown.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Wide_grip_lat_pull_down_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=SALxEARiMkw',
        title: 'How to do Lat Pulldowns (AVOID MISTAKES!)',
        creator: 'ATHLEAN-X™',
      },
    ],
  },
  'pl-cable-face-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-cable-face-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=eTCBSFlCJ_s',
        title: 'How to do a Face Pull | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'pl-cable-rear-delt-fly': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-cable-rear-delt-fly-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-cable-rear-delt-fly-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Rear_Delt_Fly/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-cable-rear-delt-fly-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Rear_Delt_Fly/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-cable-rear-delt-fly.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Bent_over_lateral_cable_raises_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=lq9K3lnHWKk',
        title: 'How To PROPERLY Perform a Standing Cable Rear Delt Fly',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'pl-cable-single-arm-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-cable-single-arm-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CrylzZHfO1c',
        title: 'Single Arm Seated Cable Row | How To Perform It Correctly',
        creator: 'KAGED',
      },
    ],
  },
  'pl-cable-straight-arm-pulldown': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-cable-straight-arm-pulldown-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-cable-straight-arm-pulldown-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Straight-Arm_Pulldown/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-cable-straight-arm-pulldown-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Straight-Arm_Pulldown/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=duHQk2PxNos',
        title: 'Cable Straight Arm Pulldown - Proper Form & Technique [4K]',
        creator: 'Steev',
      },
    ],
  },
  'pl-band-face-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-face-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JBpj9-3tP0c',
        title: 'How To Do Face Pull With Resistance Band | Upper Back & Rear Delts Workout',
        creator: 'Fitness My Life',
      },
    ],
  },
  'pl-band-pull-apart': {
    stills: [
      formGuide(require('../../../assets/images/exercises/pl-band-pull-apart-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/pl-band-pull-apart-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Band_Pull_Apart/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/pl-band-pull-apart-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Band_Pull_Apart/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=smSSXITNpCI',
        title: 'How To Do Band Pull Aparts',
        creator: 'Rogue Fitness',
      },
    ],
  },
  'pl-band-lat-pulldown': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-lat-pulldown-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=VxCt-KKvzBQ',
        title: 'Resistance Band Lat Pulldown (At Home): How To',
        creator: 'Hammer Fitness',
      },
    ],
  },
  'pl-band-shrug': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-shrug-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JcgLXCqSpKQ',
        title: 'How to Do Shrugs with Resistance Bands! Basic Shrugs and Variations with Bands!',
        creator: 'Scott Abel Coaching',
      },
    ],
  },
  'pl-kb-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-kb-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=IyQAMOV0WAc',
        title: 'How to Perform the Kettlebell Row | Important Full Body Exercise',
        creator: 'Greg Brookes',
      },
    ],
  },
  'pl-kb-high-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-kb-high-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=OkLpueSAKrY',
        title: 'How to Perform the Kettlebell High Pull | Full Movement Breakdown',
        creator: 'Greg Brookes',
      },
    ],
  },
  'pl-kb-renegade-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-kb-renegade-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JGDdzQdRZns',
        title: 'Exercise Tutorial: KB Renegade Row',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'pl-db-pullover': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-pullover-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Qc4L9I3pHnw',
        title: 'How to Perform Dumbbell Pullovers | Back Exercise Tutorial',
        creator: 'Buff Dudes Workouts',
      },
    ],
  },
  'bi-bb-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-bb-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JJB8XgKltA8',
        title: 'BARBELL CURLS | Biceps | How-To Exercise Tutorial',
        creator: 'Buff Dudes Workouts',
      },
    ],
  },
  'bi-hammer-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-hammer-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zC3nLlEvin4',
        title: 'How To: Dumbbell Hammer Curl',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'bi-concentration-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-concentration-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Jvj2wV0vOYU',
        title: 'How To: Dumbbell Concentration Curl',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'bi-band-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-band-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=RyWX9e7imhc',
        title: 'How to Do Bicep Curls with Resistance Bands | No Weights Needed!',
        creator: 'YuryFit',
      },
    ],
  },
  'bi-cable-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-cable-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2MUEL4nL6hA',
        title: 'How to PROPERLY Cable Bicep Curl For Bigger Biceps (EASY FIX)',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'bi-kb-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-kb-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Bk22u7e6G8E',
        title: 'Exercise Tutorial: Kettlebell Bicep Curl',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'bi-db-incline-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-db-incline-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=1gCfaEWk_Ds',
        title: 'How to Incline Dumbbell Curl | Form Tutorial',
        creator: 'Physique Development',
      },
    ],
  },
  'bi-cross-body-hammer-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/bi-cross-body-hammer-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=TXgqIvYORgU',
        title: 'How To Do Cross Body Hammer Curl | Exercise Demo',
        creator: 'OriGym',
      },
    ],
  },
  'fa-db-reverse-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-db-reverse-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=krZ6pWGZ8xo',
        title: 'How to Do Dumbbell Reverse Wrist Curls',
        creator: 'LIVESTRONG',
      },
    ],
  },
  'fa-db-pinch-hold': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-db-pinch-hold-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=LARw21BBiDk',
        title: 'Plate Pinch | Proper Form Tutorial for Grip Strength',
        creator: 'FIT.nl',
      },
    ],
  },
  'cr-db-farmers': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-db-farmers-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=lLAw6fUccKA',
        title: "Farmer's Carry Tutorial - Proper Form and Technique",
        creator: 'Runna',
      },
    ],
  },
  'cr-db-suitcase': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-db-suitcase-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=y-hn_Ha1-RE',
        title: 'How To Perform The Suitcase Carry',
        creator: 'Dr. Carl Baird',
      },
    ],
  },
  'cr-db-overhead': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-db-overhead-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=VBy9GT2MNpw',
        title: 'Single Arm Dumbbell Overhead Carry | A Tutorial',
        creator: 'Signum Fitness & Nutrition',
      },
    ],
  },
  'cr-db-front-rack': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-db-front-rack-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=RoXR4dhtiD8',
        title: 'Atom // How To: Dumbbell Front Rack Carry',
        creator: 'RPM Training Co',
      },
    ],
  },
  'cr-kb-farmers': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-kb-farmers-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CiN1iw856rQ',
        title: 'How To Do A KETTLEBELL FARMERS WALK CARRY | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'cr-kb-suitcase': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-kb-suitcase-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=iq5D5SU2Oq4',
        title: 'How To Do Kettlebell Suitcase Carry | Exercise Demo',
        creator: 'OriGym',
      },
    ],
  },
  'cr-kb-overhead': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-kb-overhead-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=54POVWkWjEs',
        title: 'Kettlebell Overhead Carry',
        creator: '[P]rehab',
      },
    ],
  },
  'cr-kb-goblet-carry': {
    stills: [formGuide(require('../../../assets/images/exercises/cr-kb-goblet-carry-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=O6sqSWhT8TM',
        title: 'Kettlebell Goblet Carry',
        creator: 'Block Fitness',
      },
    ],
  },
  'co-plank': {
    stills: [formGuide(require('../../../assets/images/exercises/co-plank-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/sfK30okTrtE',
        title: 'Who’s planking?: Exercise Demonstration by a Physical Therapist',
        creator: 'Revival Performance Physical Therapy',
      },
      {
        url: 'https://www.youtube.com/watch?v=A2b2EmIg0dA',
        title: 'How To Plank (Proper Form | Cues | Progressions)',
        creator: 'E3 Rehab',
      },
    ],
  },
  'co-side-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=iNbH7_edNI8',
        title: 'Side Plank Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/watch?v=sc6_7sgQbhw',
        title: '30 Seconds Side Plank Hold [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-plank-shoulder-tap': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gKA5LBy7WAI',
        title: 'How To Properly Do a Plank with Shoulder Taps - Strength Exercises',
        creator: 'Wellen',
      },
    ],
  },
  'co-plank-updown': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=9CvuiMeWQZo',
        title: 'How to do an Up-Down Plank',
        creator: 'Tone and Tighten',
      },
    ],
  },
  'co-bear-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XqH46t5TD98',
        title: 'How To Do A Bear Plank with Traci Copeland | The Right Way',
        creator: 'Well+Good',
      },
    ],
  },
  'co-deadbug': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-deadbug-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dead_Bug/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-deadbug-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dead_Bug/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/kSYl6XOzQ5U',
        title: 'Dead Bug Exercise Demonstration',
        creator: 'SOS Physiotherapy',
      },
      {
        url: 'https://www.youtube.com/watch?v=bxn9FBrt4-A',
        title: 'How to do a Dead Bug | Proper Form & Technique | NASM',
        creator: 'National Academy of Sports Medicine (NASM)',
      },
    ],
  },
  'co-bird-dog': {
    clips: [
      {
        url: 'https://www.youtube.com/shorts/j-cX-4I-1pQ',
        title: 'Do the Bird Dog Exercise Like a Pro: A Simple Step-by-Step Guide',
        creator: 'Hinge Health',
      },
      {
        url: 'https://www.youtube.com/watch?v=biN8oIV1umA',
        title: 'How to PROPERLY Perform Bird Dogs (Step-by-Step)',
        creator: 'Colossus Fitness',
      },
    ],
  },
  'co-hollow-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0yPin8hSc8o',
        title: 'Hollow Body Hold | Proper Form Tutorial for Core Stability',
        creator: 'FIT.nl',
      },
    ],
  },
  'co-hanging-leg-raise': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-hanging-leg-raise-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Hanging_Leg_Raise/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-hanging-leg-raise-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Hanging_Leg_Raise/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=rbOJSK07AGA',
        title: 'Hanging Leg Raise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-hanging-knee-raise': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=l7OroezzX9k',
        title: 'Hanging Knee Raise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/watch?v=xlu7iDDvhMo',
        title: '30 Knee-to-Elbows [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-bicycle-crunch': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=kDPxFoCmb-w',
        title: 'Bicycle Crunch Tutorial',
        creator: '4WRD | 4 WEEK WORKOUTS & NUTRITION',
      },
      {
        url: 'https://www.youtube.com/watch?v=YzjOvVnhN5g',
        title: 'Bicycle Crunch - Exercise Library (CORE)',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-reverse-crunch': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-reverse-crunch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Reverse_Crunch/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-reverse-crunch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Reverse_Crunch/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gAyTBB4lm3I',
        title: 'Reverse Crunch',
        creator: 'LivestrongWoman',
      },
    ],
  },
  'co-crunch': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-crunch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Crunches/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-crunch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Crunches/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-crunch.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Crunches_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Xyd_fa5zoEU',
        title: 'How to Do Crunches',
        creator: 'LIVESTRONG',
      },
      {
        url: 'https://www.youtube.com/watch?v=HiRsmHH7psA',
        title: 'Exercise Library: Crunches',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-situp': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-situp-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Sit-Up/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-situp-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Sit-Up/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=iL06z9PWYs8',
        title: 'How to do Sit Ups | Proper Form!',
        creator: 'Combat Fit',
      },
      {
        url: 'https://www.youtube.com/watch?v=5bOjqyL0PGE',
        title: 'Exercise Library: Sit-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-vup': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DfVArP2V6kg',
        title: 'V-Ups Tutorial For Beginners (4 Variations Covered)',
        creator: 'Gymless Fitness',
      },
      {
        url: 'https://www.youtube.com/watch?v=-JIwvMSk4vo',
        title: 'Exercise Library: V-Ups',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-flutter-kicks': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-flutter-kicks-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Flutter_Kicks/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-flutter-kicks-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Flutter_Kicks/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6D23AyECRGQ',
        title: 'How to Do Flutter Kicks | Hyper Engage Your Lower Abs, Whole Rectus Abdominis and Oblique Muscles',
        creator: 'LivingFit',
      },
    ],
  },
  'co-superman': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-superman-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Superman/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-superman-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Superman/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-superman.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Supermans_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=UXUGfiNL1lI',
        title: 'How to PROPERLY Do a Superman Exercise (FIX YOUR FORM)',
        creator: 'Colossus Fitness',
      },
      {
        url: 'https://www.youtube.com/watch?v=PAn3rmqrCB0',
        title: '30 Seconds Superman Hold [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-russian-twist-bw': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-russian-twist-bw-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Russian_Twist/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-russian-twist-bw-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Russian_Twist/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=IJDOoVyVjhc',
        title: 'Russian Twist Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-toe-touch': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-toe-touch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Toe_Touchers/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-toe-touch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Toe_Touchers/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=rHEzFsLf4-o',
        title: 'Toe Touches | Proper Form Tutorial for Ab Activation',
        creator: 'FIT.nl',
      },
    ],
  },
  'co-scissor-kick': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-scissor-kick-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Scissor_Kick/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-scissor-kick-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Scissor_Kick/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=IBS84c5uA_A',
        title: 'HIIT Exercises: How to do Scissor Kicks',
        creator: 'HIIT Academy',
      },
    ],
  },
  'co-bear-crawl-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=U3Y58Kyw7Xw',
        title: 'Bear Crawl Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-standing-side-bend-bw': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=wY9nQ-yfRwo',
        title: 'Standing Side Bend Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
      {
        url: 'https://www.youtube.com/watch?v=zuRhGtcOlHY',
        title: '40 Side Bends [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'co-mountain-climber': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-mountain-climber-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Mountain_Climbers/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-mountain-climber-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Mountain_Climbers/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Q_olQdxEPF4',
        title: 'Mountain Climber Exercise Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-db-russian-twist': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=TfTUk2AjV7g',
        title: 'Russian Twists with Dumbbell',
        creator: 'Critical Bench Compound',
      },
    ],
  },
  'co-db-side-bend': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-db-side-bend-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Side_Bend/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-db-side-bend-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Dumbbell_Side_Bend/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-db-side-bend.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Side_bend_with_dumbbell_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=dL9ZzqtQI5c',
        title: 'How to Do a Dumbbell Side Bend | Ab Workout',
        creator: 'Buff Dudes Workouts',
      },
    ],
  },
  'co-db-woodchop': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=b65s5BtdOEc',
        title: 'How To Do A Dumbbell Woodchop | The Right Way | Well+Good',
        creator: 'Well+Good',
      },
    ],
  },
  'co-kb-windmill': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-kb-windmill-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Kettlebell_Windmill/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-kb-windmill-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Kettlebell_Windmill/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=l77n4NJDLmA',
        title: 'Standing Kettlebell Windmills Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-kb-russian-twist': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=PkGPokybYaU',
        title: 'How To Do A KETTLEBELL RUSSIAN TWIST | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'co-cable-woodchop': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Gwcf4TOj1hc',
        title: 'Cable Woodchop | Proper Form Tutorial for Core Rotation',
        creator: 'FIT.nl',
      },
    ],
  },
  'co-cable-crunch': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-cable-crunch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Crunch/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-cable-crunch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Cable_Crunch/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-cable-crunch.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Seated_ab_crunch_with_cable_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=mkE_gNDQN8o',
        title: 'How To Seated Cable Crunch | Tutorial | Upper Ab Exercise',
        creator: 'Anabolic Aliens',
      },
    ],
  },
  'co-cable-pallof-press': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xeFp4MXad98',
        title: 'Cable Pallof Press | Proper Form Tutorial for Core Stability',
        creator: 'FIT.nl',
      },
    ],
  },
  'co-band-pallof-press': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-band-pallof-press-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pallof_Press/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-band-pallof-press-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Pallof_Press/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=iBDXkpKDRy8',
        title: 'Band Pallof Press - Proper Form & Technique [4K]',
        creator: 'Steev',
      },
    ],
  },
  'co-band-woodchop': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ooP1Zq6lq5Y',
        title: 'Woodchop Exercise with Resistance Band',
        creator: 'Meglio TV',
      },
    ],
  },
  'co-band-deadbug-pull': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=A-boaViwUOA',
        title: 'Banded Deadbug Tutorial - Proper Form and Technique',
        creator: 'Runna',
      },
    ],
  },
  'co-decline-situp': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=QhGU5cmNZds',
        title: 'How To: Decline Sit-Up',
        creator: 'ScottHermanFitness',
      },
    ],
  },
  'co-decline-crunch': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-decline-crunch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Decline_Crunch/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-decline-crunch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Decline_Crunch/1.jpg',
      },
      {
        file: require('../../../assets/images/exercises/co-decline-crunch.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Decline_crunch_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=-jFc70vicCg',
        title: 'Decline Bench Crunch',
        creator: 'workouts4fitness',
      },
    ],
  },
  'co-back-extension': {
    stills: [
      {
        file: require('../../../assets/images/exercises/co-back-extension.webp'),
        license: 'cc-by-sa',
        attribution: 'Everkinetic, CC BY-SA 3.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Hyperextensions_2.svg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gLT-WLH84B4',
        title: 'Back Extension (Hyperextension) - Proper Form & Technique [4K]',
        creator: 'Steev',
      },
    ],
  },
  'co-l-sit-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=eywCpp0p7lg',
        title: 'The Perfect L-Sit Tutorial - Beginner Friendly',
        creator: 'STRIQfit',
      },
    ],
  },
  'co-hollow-rock': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=V72HS7BV42g',
        title: 'How To Do The Hollow Rock Core Exercise',
        creator: 'Hilton Head Health',
      },
    ],
  },
  'co-weighted-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=H88Ip-MUWn0',
        title: 'How To do a Weighted Plank by yourself',
        creator: 'Strength Side',
      },
    ],
  },
  'co-band-standing-crunch': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YZhn4ydyKvw',
        title: 'Standing Resistance Band Crunch',
        creator: 'FITASTIC',
      },
    ],
  },
  // ---- DAREBEE Exercise Library & Exercise of the Day ----
  'ca-burpees': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-burpee-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=dr3LUT0VK_I',
        title: '10 Burpees [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'ca-march-high-knees-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-steady-high-knee-march-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/7IOmh_rxyKA',
        title: '30 Seconds High Knees [ Exercise of the Day ]',
        creator: 'DAREBEE',
      },
    ],
  },
  'mob-standing-hip-circles': {
    stills: [
      formGuide(require('../../../assets/images/exercises/stretch-standing-hip-circles-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/mob-standing-hip-circles-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Standing_Hip_Circles/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/mob-standing-hip-circles-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Standing_Hip_Circles/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=D_kQzMB_HkY',
        title: 'How to do standing hip circles (Home training exercise)',
        creator: 'Sporting Health Club',
      },
    ],
  },
  'ca-star-jumps': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cardio-star-jumps-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/ca-star-jumps-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Star_Jump/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/ca-star-jumps-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Star_Jump/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/OGx-9nzsr_E',
        title: 'Star jumps',
        creator: 'SweatwithSarah',
      },
    ],
  },
  'mob-active-hamstring-stretch': {
    stills: [
      formGuide(require('../../../assets/images/exercises/stretch-active-hamstring-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/mob-active-hamstring-stretch-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Hamstring_Stretch/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/mob-active-hamstring-stretch-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Hamstring_Stretch/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=q4N8QxQPYDw',
        title: 'Supine Active Hamstring Stretch',
        creator: 'MGHOrthopaedics',
      },
    ],
  },
  'ca-mountain-climbers-fast': {
    stills: [
      formGuide(require('../../../assets/images/exercises/cardio-fast-mountain-climbers-form-guide.webp')),
      {
        file: require('../../../assets/images/exercises/ca-mountain-climbers-fast-fedb-0.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Mountain_Climbers/0.jpg',
      },
      {
        file: require('../../../assets/images/exercises/ca-mountain-climbers-fast-fedb-1.webp'),
        license: 'public-domain',
        attribution: 'free-exercise-db (The Unlicense)',
        sourceUrl: 'https://github.com/yuhonas/free-exercise-db/blob/main/exercises/Mountain_Climbers/1.jpg',
      },
    ],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ruQ4ZwncXBg',
        title: 'Marines Force Fitness-Mountain Climbers',
        creator: 'U.S. Forces Fitness',
      },
    ],
  },
  'ca-burpee-broad-jump-combo': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zoJI2d4i-Sg',
        title: 'Burpee Broad Jump',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-butt-kickers': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-butt-kickers-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=OjDm3CJiy2Y',
        title: 'Butt Kicks (Sprinter Drills)',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-high-knees': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-high-knees-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gDjAHX1G2uc',
        title: 'High Knees: H.I.I.T. (Running Mechanics)',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'pl-centering-breath': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-centering-breath-form-guide.webp'))],
  },
  'pl-pelvic-tilt': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-pelvic-tilt-form-guide.webp'))],
  },
  'pl-cat-cow-warmup': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-cat-cow-form-guide.webp'))],
  },
  'pl-standing-roll-down': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-standing-roll-down-form-guide.webp'))],
  },
  'pl-cobra-prep': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-cobra-prep-form-guide.webp'))],
  },
  'pl-standing-leg-circle': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-standing-leg-circle-form-guide.webp'))],
  },
  'pl-standing-side-bend': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-standing-side-bend-form-guide.webp'))],
  },
  'pl-saw-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/pilates-saw-form-guide.webp'))],
  },
  'ca-kb-snatch-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-kettlebell-snatch-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=MQDl5-xN5QI',
        title: 'Single Arm Kettlebell Snatch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-kb-swing-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-kettlebell-swing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=UOsT9jqbcn4',
        title: 'Kettlebell Swings',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-lateral-shuffle': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-lateral-shuffle-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=4_zywuECg84',
        title: 'Lateral Shuffle',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-plank-jacks': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-plank-jacks-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nf2qXVNp-mI',
        title: 'High Plank Jack',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-squat-jumps': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-squat-jumps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=d5UrisnCA90',
        title: 'Jump Squats: H.I.I.T. (Quads, Glutes and Calves)',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'ca-tuck-jumps': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-tuck-jumps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2svqJ2lJtZA',
        title: 'Tuck Jumps',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-couch-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-couch-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JUKW9kNNzhY',
        title: 'Couch Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-cross-body-shoulder-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cross-body-shoulder-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=0fSwtWk6BcY',
        title: 'Static Rear Shoulder Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-frog-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-frog-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=c6DEFLUqEA0',
        title: 'Static Frog Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-pendulum-shoulder': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-pendulum-shoulder-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=RyK5j026WNo',
        title: '3 Way Shoulder Pendulum',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-squat-to-stand': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-squat-to-stand-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=2xT68Yq5twI',
        title: 'Squat to Stand With Reach',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-standing-side-bend': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-standing-side-bend-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=a6Y6ZlAmvIg',
        title: 'Overhead Reaching Lat and Oblique Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-supine-figure-4': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-supine-figure-four-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Iaoh_fQ8BhI',
        title: 'Supine Piriformis Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-supine-hamstring-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-supine-hamstring-strap-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=4pdDG7kHml0',
        title: 'Supine Hamstring Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-wall-angel': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wall-angel-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hGhoH8qK-7s',
        title: 'Wall Angels',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-worlds-greatest': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-worlds-greatest-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=F-glWKg3xFI',
        title: 'Spiderman Stretch with Rotation',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-wrist-flexor-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wrist-flexor-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=owLMGFNj73k',
        title: 'Bicep and Wrist Extension Stretch',
        creator: 'Unbroken Fitness Solutions',
      },
    ],
  },
  'mob-it-band-wall': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-it-band-wall-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=WcbGdkY_oDc',
        title: 'IT Band Stretches | Wall or Chair-Supported Stretch',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'mob-it-band-forward-fold': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-it-band-forward-fold-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=pZRaXtwVtws',
        title: 'IT Band Stretches | Forward Fold With Crossed Legs',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'mob-it-band-supine': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-it-band-supine-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=bJuV3ZQVfJ4',
        title: 'IT Band Stretches | Supine IT Band Stretch',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'mob-it-band-strap': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-it-band-strap-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=5QBTyyeC6Xs',
        title: 'IT Band Stretches | Belt/Strap IT Band Stretch',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'mob-it-band-side-lying': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-it-band-side-lying-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=dJvw6reGKKk',
        title: 'IT Band Stretches | Side-Lying IT Band Stretch',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'mob-plantar-toe-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-plantar-toe-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/ta2D40d22ZI',
        title: 'One simple toe pull to loosen stiff, painful feet.',
        creator: 'Dr. Karena Wu',
      },
    ],
  },
  'mob-plantar-stair-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-stair-achilles-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/lGbomAClz4w',
        title: 'Paediatric  Therapy - Off step calf stretch',
        creator: 'Herefordshire & Worcestershire Health and Care NHS (HWHCT_NHS)',
      },
    ],
  },
  'fr-plantar-fascia': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-foot-arch-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/UUM78E3YWbk',
        title: 'Tennis Ball Roll for Plantar Fasciitis | Best Heel Pain Relief Exercise | Foot Massage',
        creator: 'Anand Physical Therapy Academy ',
      },
    ],
  },
  'mob-wrist-extensor-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wrist-extensor-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/yZcvTeLFx4U',
        title: 'Exercise of the Day: Wrist Extensor Stretch',
        creator: 'Feel Good Life with Coach Todd',
      },
    ],
  },
  'mob-forearm-rotation-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-forearm-rotation-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/Mq2AO9n5k4o',
        title: 'Supination/Pronation',
        creator: 'Hope Physical Therapy and Aquatics',
      },
    ],
  },
  'mob-knee-to-shoulder': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-knee-to-shoulder-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/z_iDs0MZVQ4',
        title: 'Supine piriformis stretch',
        creator: 'Restore Motion',
      },
    ],
  },
  'mob-seated-figure-4': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-seated-figure-four-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/x170rAbXvZc',
        title: 'Pro Tip - Seated Figure 4 Stretch',
        creator: 'Mobility Doc',
      },
    ],
  },
  'mob-towel-shoulder-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-towel-shoulder-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/dAU3iv8aDLo',
        title: 'Frozen Shoulder? Try This Simple Towel Stretch 🔥',
        creator: 'Gav Noble - 10X Physio Channel',
      },
    ],
  },
  'mob-wall-climb-shoulder': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-wall-climb-shoulder-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/ArB91ibx848',
        title: 'Wall climb - shoulder exercise',
        creator: 'Pat Carr',
      },
    ],
  },
  'mob-cane-overhead-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cane-overhead-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/jfMhuaQNX-g',
        title: 'Shoulder FL Stretch - Dowel',
        creator: 'P4S Golf',
      },
    ],
  },
  'mob-cane-behind-back-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cane-behind-back-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/vqTPLseK3CA',
        title: 'Cane Internal Rotation (IR)',
        creator: 'Hope Physical Therapy and Aquatics',
      },
    ],
  },
  'mob-cane-external-rotation-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-cane-external-rotation-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/jMeQGk_qKbU',
        title: 'Cane External Rotation Exercise for Frozen Shoulder | Improve Shoulder Mobility & Reduce Stiffness',
        creator: 'Anand Physical Therapy Academy ',
      },
    ],
  },
  'mob-tendon-glide': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-finger-tendon-glide-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/fDXOIM8WgX8',
        title: 'Tendon Glide Exercise 2 | Improve Finger Mobility and Flexibility',
        creator: 'Kuching Specialist Hospital',
      },
    ],
  },
  'mob-thumb-opposition-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-thumb-opposition-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/w7XSn-TEMS4',
        title: 'Thumb & Finger Strengthening',
        creator: 'ChadGOrthoOT',
      },
    ],
  },
  'mob-yogi-squat': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-yogi-squat-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/d-YleDG6Xu4',
        title: 'How to do Malasana (Yogi Squat) correctly ✅ Any Questions? ⬇️ #yogatips #yoga101',
        creator: 'YogaCandi',
      },
    ],
  },
  'mob-lying-trunk-rotation': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-lying-trunk-rotation-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/LdLDEz9deYU',
        title: 'Supine Lower Trunk Rotation | Relieve Back Tension with this easy stretch!',
        creator: 'EmergeOrtho-Triangle Region',
      },
    ],
  },
  'mob-seated-lumbar-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-seated-lumbar-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/4K4pQ_c1UZM',
        title: 'Lumbar Extension Exercise or "Seated Booty Pop" // #lumbar #backpain #exercises #backhealth #spine',
        creator: 'Stronghold Health',
      },
    ],
  },
  'mob-active-calf-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-active-calf-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/FJyLjBQHVlI',
        title: '🔴 Active Calf Stretch',
        creator: 'Brookbush Institute',
      },
    ],
  },
  'mob-psoas-leg-dangle': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-bed-edge-psoas-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/PB4xHnr5qOo',
        title: 'Hip Flexor Stretch at Edge of Bed',
        creator: 'Motus Rx Physical Therapy',
      },
    ],
  },
  'mob-chin-tuck': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-chin-tuck-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/zlR5Gq2mclc',
        title: 'How to do the Chin Tuck exercise correctly.',
        creator: 'Something Bigger Show by Rodrigo Canelas',
      },
    ],
  },
  'mob-pelvic-tilt': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-pelvic-tilt-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/7VMh43GLeww',
        title: '✅ Pelvic tilt exercise for lower back pain #pelvictilt',
        creator: 'Gav Noble - 10X Physio Channel',
      },
    ],
  },
  'ca-treadmill-walk': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-treadmill-walk-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/WpXrdwhEdDc',
        title: 'Treadmill Walking - Perfect Form Guide #shorts',
        creator: 'GymPanda',
      },
    ],
  },
  'ca-treadmill-jog': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-treadmill-jog-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/zeS4qu6bXy4',
        title: 'Treadmill Running Form #runningtips',
        creator: 'Chari Hawkins',
      },
    ],
  },
  'ca-treadmill-incline-walk': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-treadmill-incline-walk-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/RO1IRfIKlWM',
        title: 'Incline Treadmill Walk Form Check | ShonenFit #Shorts',
        creator: 'ShonenFit',
      },
    ],
  },
  'ca-bike-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-bike-steady-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/w73jj7Vg-00',
        title: 'How to Setup Bike Seat #shorts',
        creator: 'McCrazy Fit',
      },
    ],
  },
  'ca-rower-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-rower-steady-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/1KV9MCDVYRs',
        title: 'How to use a rowing machine.',
        creator: 'Cleveland Clinic',
      },
    ],
  },
  'ca-elliptical-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-elliptical-steady-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/KRxofTVbTbM',
        title: 'Proper Form on the Elliptical: Essential Tips from @TheRealAshleyBlack',
        creator: 'Ashley Black',
      },
    ],
  },
  'ca-stairclimber-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-stairclimber-steady-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/bJMM4nLGE4E',
        title: 'STAIR CLIMBER TUTORIAL 🪜 // Conquer the stairs for your next cardio workout at Planet Fitness!',
        creator: 'KevTheTrainer',
      },
    ],
  },
  'ca-low-impact-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-low-impact-march-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/5l-A5_-BPUg',
        title: 'One-Minute Marching in Place Exercise for Beginners #walkroutine #beginnerworkout #easyworkout',
        creator: 'Justin Agustin',
      },
    ],
  },
  'ca-step-up-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-steady-step-up-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/ewpFS-Uxiy4',
        title: 'Physical Therapist Shows You How to Do Step Ups So Your Knees Actually Thank You',
        creator: 'Emily Waldorf',
      },
    ],
  },
  'ca-shadow-boxing': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-shadow-boxing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/CeFOZMBy7WY',
        title: 'Shadow Boxing? Do This!! | Good Form and Technique #shorts',
        creator: 'Tony Jeffries',
      },
    ],
  },
  'ca-brisk-walk-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-brisk-walk-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/PHFhXp6CH0k',
        title: 'Maintain Good Posture While Brisk Walking | Walk Smarter, Reduce Strain & Improve Balance Every Day',
        creator: 'Human Mirror of Destiny Lab – Just See, ذرا سوچیے',
      },
    ],
  },
  'ca-stair-walk-bw': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-stair-walk-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/1jcNa-dRHOk',
        title: 'How-To Workout From Your Stairs',
        creator: 'Justin Agustin',
      },
    ],
  },
  'ca-bike-recovery-spin': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-bike-recovery-spin-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/rKS4Kgex_1Q',
        title: 'Active recovery spin class with Kirsten Allen',
        creator: 'Kirsten Allen',
      },
    ],
  },
  'ca-intervals-bw': {
    clips: [
      {
        url: 'https://www.youtube.com/shorts/_V1yyDyAd_o',
        title: '5 Bodyweight Cardio Circuit Exercises',
        creator: 'Exercises For Injuries',
      },
    ],
  },
  'ca-skater-hops': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-skater-hops-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/80q7m7lsiZc',
        title: 'Skater Exercise Move | FightCamp Proper Form & Technique',
        creator: 'FightCamp',
      },
    ],
  },
  'ca-fast-feet': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-fast-feet-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/LK-EBdlG7Hg',
        title: 'How To Get Faster Feet Using No Equipment #soccer #youtubeshorts #football',
        creator: 'Prolific Soccer',
      },
    ],
  },
  'ca-bike-sprints': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-bike-sprints-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/D4EMc0oEDyA',
        title: 'How To Perform Wind Sprints On A Spin Bike // Best Fat Loss Interval Training  // #Shorts',
        creator: 'FrankWallFitness',
      },
    ],
  },
  'ca-rower-sprints': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-rower-sprints-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/GMeLchrYURQ',
        title: 'The best rowing interval workout ever #rowing #intervals #cardio done o',
        creator: 'Bobby Maximus',
      },
    ],
  },
  'ca-db-thrusters-interval': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-dumbbell-thruster-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/buaJ_Za7IWA',
        title: 'Dumbbell Thruster 🔥 Learn Proper Technique #shorts #exercise',
        creator: 'Sharon Schilder Workouts',
      },
    ],
  },
  'ca-db-squat-press-interval': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-dumbbell-squat-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/1dcQR0wNTYI',
        title: 'How to Properly Perform The Dumbbell Squat to Press With Good Form (Exercise Demonstration)',
        creator: 'Gerardi Performance',
      },
    ],
  },
  'ca-bear-crawl-interval': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-bear-crawl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/j_YR2n8x1D8',
        title: 'Simple Bear Crawl Tutorial For Workouts At Home For Beginners #howtoworkout',
        creator: 'Clem Fitness',
      },
    ],
  },

  // ---- Suspension trainer (TRX) ------------------------------------------------
  'trx-chest-press': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=aW2kB1FduV8',
        title: 'TRX Chest Press: A quick guide for safe execution ✅',
        creator: "Julie's Garage Gym",
      },
    ],
  },
  'trx-chest-fly': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=VeiB4nfSpeQ',
        title: 'TRX Chest Fly — (GREAT TRX CHEST WORKOUT)',
        creator: 'Fit Father Project - Fitness For Busy Fathers',
      },
    ],
  },
  'trx-tricep-extension': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xODm0GuXPMY',
        title: 'TRX Tricep Extension — Best Bodyweight Triceps Exercise',
        creator: 'Fit Father Project - Fitness For Busy Fathers',
      },
    ],
  },
  'trx-row': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=N_14s8zFOms',
        title: 'Exercise Tutorial: TRX Row',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'trx-single-arm-row': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=z2AdYniU2tM',
        title: 'Exercise Tutorial: TRX Single Arm Row (Elbow Up)',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'trx-y-fly': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hfHUWysKgXc',
        title: 'How to perform the TRX Y Fly',
        creator: 'CORE Strong Fitness',
      },
    ],
  },
  'trx-rear-delt-fly': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xh49S9LoYbo',
        title: 'TRX "T" Rear Delt Fly',
        creator: 'IMPACT-X Performance',
      },
    ],
  },
  'trx-face-pull': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zgZ7_o5aYlw',
        title: 'How To Do A TRX FACE PULL | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'trx-bicep-curl': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=tfFVFnaSwtg',
        title: 'TRX Bicep Curl',
        creator: 'Dr. Christy Lee',
      },
    ],
  },
  'trx-squat': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DTXphTGYd0g',
        title: 'TRX Squat',
        creator: 'TRXtraining',
      },
    ],
  },
  'trx-squat-jump': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=R9FgSeoy2ME',
        title: 'Exercise Tutorial: TRX Squat Jump',
        creator: 'Bowden Gym Collective (Formerly NAFC)',
      },
    ],
  },
  'trx-pistol-squat': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=d5xgMtA4c5g',
        title: 'TRX Pistol Squat & Shrimp Squat',
        creator: 'Dr. Christy Lee',
      },
    ],
  },
  'trx-single-leg-lunge': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Bvn1lP7jo8Y',
        title: 'TRX Single Leg Lunges',
        creator: 'Courtney Drewsen',
      },
    ],
  },
  'trx-reverse-lunge': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YOVpY_dQ8-c',
        title: 'How To Do A TRX REVERSE LUNGE | Exercise Demonstration Video and Guide | LiveLeanTV',
        creator: 'Live Lean TV',
      },
    ],
  },
  'trx-hamstring-curl': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ckOKTSnOCx0',
        title: 'How To Do A TRX HAMSTRING CURL | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'trx-single-leg-hip-hinge': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=EIkm8Plbx3w',
        title: 'Exercise Tutorial: TRX Single Leg Hip Hinge',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'trx-atomic-pushup': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XXF3AB9vGzs',
        title: 'How To Do TRX Atomic Push-ups - The Proper Form & How to Use Them In Your Routine',
        creator: 'Fit Father Project - Fitness For Busy Fathers',
      },
    ],
  },
  'trx-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=wO5mMiGWmyA',
        title: 'TRX PLANK TUTORIAL (Plus 3 Killer Variations!)',
        creator: "Max's Best Bootcamp",
      },
    ],
  },
  'trx-side-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=WovS7SQa-T8',
        title: 'TRX Side Plank with Oblique Crunch - DC FIT',
        creator: 'DC FIT',
      },
    ],
  },
  'trx-oblique-crunch': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=VWfvNH-VeJI',
        title: 'TRX Oblique Crunches',
        creator: 'Strongher Programming',
      },
    ],
  },
  'trx-pike': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xk4FBzaUFE4',
        title: 'TRX Pike Exercise | How To Perform It Correctly',
        creator: 'Anthony Mayatt',
      },
    ],
  },
  'trx-mountain-climber': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=InIKovtYzCQ',
        title: 'TRX Mountain Climbers',
        creator: 'Jenny LaBaw',
      },
    ],
  },

  // ---- Foam rolling / self-myofascial release (additional areas) --------------
  'fr-hip-flexors': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-hip-flexors-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=U8JvMNg3eCE',
        title: 'How to Foam Roll Your Hip Flexors | Foam Rolling',
        creator: 'Howcast',
      },
    ],
  },
  'fr-piriformis': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-piriformis-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=mNQUujak3sE',
        title: '"How to Foam Roll Your Piriformis" for Sciatica',
        creator: 'The Source Chiropractic',
      },
    ],
  },
  'fr-glute-medius': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-glute-medius-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=XqU06LC0uvM',
        title: 'How To Foam Roll Out The Gluteus Medius',
        creator: 'Exercises For Injuries',
      },
    ],
  },
  'fr-obliques': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-obliques-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Mgua1zOzD0U',
        title: 'Foam Roll - Obliques',
        creator: 'The Masters of Strength',
      },
    ],
  },
  'fr-chest': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-chest-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=EfwRzjk-6Hs',
        title: 'How to Foam Roll Your Pectorals | Foam Rolling',
        creator: 'Howcast',
      },
    ],
  },
  'fr-triceps': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-triceps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Ccv83HlqqJ8',
        title: 'How To Foam Roll Your Triceps - Rollga Foam Rollers',
        creator: 'Rollga',
      },
    ],
  },
  'fr-forearms': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-forearms-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=PwRPbdiifpA',
        title: 'Foam Roll: Forearm Muscles (Wrist Flexors & Extensors)',
        creator: 'jjaimedc',
      },
    ],
  },
  'fr-upper-traps': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-upper-traps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=PTyuyiRF34g',
        title: 'Foam Rolling the Traps: Upper Trapezius and Levator Scapula Muscles',
        creator: 'Dr. Ryan Emmons',
      },
    ],
  },
  'fr-rhomboids': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-rhomboids-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=yYmzxoKnQRE',
        title: 'Foam Rolling the Rhomboid Muscles – How to Reduce Middle Back Pain',
        creator: 'ICT Muscle & Joint Clinic',
      },
    ],
  },
  'fr-thoracic-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-thoracic-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=qCrYe698zJU',
        title: 'Foam roller thoracic spine extension movement and mobility | Feat. Tim Keeley | No.26 | Physio REHAB',
        creator: 'Physio REHAB',
      },
    ],
  },
  'fr-shins': {
    stills: [formGuide(require('../../../assets/images/exercises/foam-roll-shins-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ogZzEw8jcxQ',
        title: 'Foam Rolling - Tibialis Anterior',
        creator: 'Retrain Pain',
      },
    ],
  },
  'cf-bb-standing': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-bb-standing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=cG6YpyQKStI',
        title: 'Standing Barbell Calf Raises',
        creator: 'Critical Bench Compound',
      },
    ],
  },
  'cf-bb-seated': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-bb-seated-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=G3dn7RzAvV8',
        title: 'Tutorial | Seated Barbell Calf Raise',
        creator: 'Get Right Results',
      },
    ],
  },
  'cf-band-standing': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-band-standing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=qXCtsKexOvQ',
        title: 'Banded Standing Calf Raises (Resistance Band Calf Exercise)',
        creator: 'Progression Training',
      },
    ],
  },
  'cf-cable-standing': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-cable-standing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Z6l_MUXvonY',
        title: 'How To Do: Cable Calf Raise | Leg Workout Exercise',
        creator: 'Fitway - Workout Trainer',
      },
    ],
  },
  'cf-rack-press': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-rack-press-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hu99U6zN66c',
        title: 'Calf press in squat rack',
        creator: '360 Fitness Personal Training Red Deer',
      },
    ],
  },
  'cf-kb-single-leg': {
    stills: [formGuide(require('../../../assets/images/exercises/cf-kb-single-leg-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=UYg36FzvoNQ',
        title: 'How To Do: Kettlebell Calf Raise - Seated Single Leg | Leg Workout Exercise',
        creator: 'Fitway - Workout Trainer',
      },
    ],
  },
  'trx-calf-raise': {
    stills: [formGuide(require('../../../assets/images/exercises/trx-calf-raise-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CeJ7z16a_8A',
        title: 'TRX Standing Calf Raise',
        creator: 'Scott Abel Coaching',
      },
    ],
  },
  'hi-db-rack-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-db-rack-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=YFC_h0HF9FY',
        title: 'Dumbbell Rack Pull Alternative',
        creator: '88 Fitness Training LLC',
      },
    ],
  },
  'hi-kb-good-morning': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-kb-good-morning-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=pCbzsTSA3Z8',
        title: 'Good Mornings with a Dumbbell or Kettlebell | A Tutorial',
        creator: 'Signum Fitness & Nutrition',
      },
    ],
  },
  'trx-assisted-good-morning': {
    stills: [formGuide(require('../../../assets/images/exercises/trx-assisted-good-morning-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=DXlboJ0tAgE',
        title: 'TRX Hip Hinge',
        creator: 'Modern Manual Therapy',
      },
    ],
  },
  'co-weighted-back-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/co-weighted-back-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=JOWrTUuvIF4',
        title: 'Weighted Back Extensions: How to',
        creator: 'Hammer Fitness',
      },
    ],
  },
  'pu-explosive-pushup-bench': {
    stills: [formGuide(require('../../../assets/images/exercises/pu-explosive-pushup-bench-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=g2K7iDDaOhI',
        title: 'Explosive Plyometric Push-up Tutorial (basic to advance)',
        creator: 'Anthony Wells',
      },
    ],
  },
  'tr-band-overhead-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/tr-band-overhead-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=uXnYNighAIQ',
        title: 'Band Overhead Triceps Extension (high door anchor)',
        creator: 'Renegade Fitness',
      },
    ],
  },
  'pl-band-high-low-pulldown': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-band-high-low-pulldown-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=gcPmrdcGh5I',
        title: 'Exercise Tutorial: Half-kneeling Lat Pull Down With Band',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'trx-vertical-row': {
    stills: [formGuide(require('../../../assets/images/exercises/trx-vertical-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=xNNEPodDcLQ',
        title: 'Exercise Tutorial: TRX High Row',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'hi-kb-vertical-high-pull': {
    stills: [formGuide(require('../../../assets/images/exercises/hi-kb-vertical-high-pull-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ZLyqZMhU0MI',
        title: 'Kettlebell High Pulls',
        creator: 'BagsBellsBodyweight',
      },
    ],
  },
  'pl-db-single-arm-vertical-row': {
    stills: [formGuide(require('../../../assets/images/exercises/pl-db-single-arm-vertical-row-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=CiSGEkAW78U',
        title: 'One Arm Dumbbell Upright Row for the Upper Trap and Medial Delt',
        creator: 'Seriously Strong Training',
      },
    ],
  },
  'ol-bb-hang-clean': {
    stills: [formGuide(require('../../../assets/images/exercises/ol-bb-hang-clean-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=n6lRtVV7LYY',
        title: 'Barbell Hang Clean - How To',
        creator: 'Bobby Maximus',
      },
    ],
  },
  'ol-bb-power-clean': {
    stills: [formGuide(require('../../../assets/images/exercises/ol-bb-power-clean-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=42a4lIShrMU',
        title: 'How To Do A BARBELL POWER CLEAN | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'ol-bb-muscle-snatch': {
    stills: [formGuide(require('../../../assets/images/exercises/ol-bb-muscle-snatch-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nJmtGVutszE',
        title: 'Muscle Snatch | Olympic Weightlifting Exercise Library',
        creator: 'Catalyst Athletics',
      },
    ],
  },
  'ol-db-hang-clean': {
    stills: [formGuide(require('../../../assets/images/exercises/ol-db-hang-clean-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=loJGqTGkXEo',
        title: 'The Dumbbell Hang Clean',
        creator: 'CrossFit',
      },
    ],
  },
  'fa-dead-hang': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-dead-hang-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Nc-JGSZZMAQ',
        title: 'Dead Hang from Pull Up Bar - Exercise Demo',
        creator: 'Pike Fitness',
      },
    ],
  },
  'fa-fingertip-plank': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-fingertip-plank-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=tActwQQ1t0k',
        title: 'Fingertip Plank Hold',
        creator: "Freddie's Modern Kung Fu",
      },
    ],
  },
  'fa-bb-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-bb-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=r5-nYE_1CXo',
        title: 'How To Do A STANDING BARBELL WRIST CURL | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'fa-bb-reverse-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-bb-reverse-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=SfENsl5klVA',
        title: 'Reverse Wrist Curl | Proper Form Tutorial for Forearm Balance',
        creator: 'FIT.nl',
      },
    ],
  },
  'fa-band-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-band-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Z64A_Q2aG3U',
        title: 'How To Do: Resistance Band Wrist Curl | Arm Workout Exercise',
        creator: 'Fitway - Workout Trainer',
      },
    ],
  },
  'fa-band-reverse-wrist-curl': {
    stills: [formGuide(require('../../../assets/images/exercises/fa-band-reverse-wrist-curl-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=c2JIMZpTtoA',
        title: 'Wrist Extension Exercise with Resistance Band',
        creator: 'Meglio TV',
      },
    ],
  },
  'nk-manual-flexion': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-manual-flexion-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=4rK-m6GvNCk',
        title: 'Isometric Cervical Flexion for Neck Strengthening',
        creator: 'Ask Doctor Jo',
      },
    ],
  },
  'nk-manual-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-manual-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=5TxB_CwzRIE',
        title: 'Neck Exercise | Manual Isometric Resistance Neck Exercise',
        creator: 'James Kelly',
      },
    ],
  },
  'nk-manual-lateral': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-manual-lateral-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=KX2OpgLVvVk',
        title: 'Lateral Neck Flexion Exercise',
        creator: 'Vive Health',
      },
    ],
  },
  'nk-band-flexion': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-band-flexion-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Ft9mKWx-qYU',
        title: 'Standing Band Neck Flexion',
        creator: 'Fluid Health and Fitness',
      },
    ],
  },
  'nk-band-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-band-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=bzVjGOCl5tY',
        title: 'Neck extension exercise band',
        creator: 'Rehab My Patient',
      },
    ],
  },
  'nk-weighted-extension': {
    stills: [formGuide(require('../../../assets/images/exercises/nk-weighted-extension-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=hYqVUHC-GhE',
        title: 'How To: Weight Plate Neck Extension',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'co-side-plank-leg-lift': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ZZkgopVBPMg',
        title: 'Core Exercises: Side Plank With Leg Lift',
        creator: 'stoneclinicPT',
      },
    ],
  },
  'co-copenhagen-plank': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=5cTh21BfXzI',
        title: 'Copenhagen Plank (Exercise Library)',
        creator: 'Horton Barbell',
      },
    ],
  },
  'co-kb-suitcase-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=nQdSi_Db0i0',
        title: 'KB Suitcase Hold',
        creator: 'Allison Tenney',
      },
    ],
  },
  'co-db-lateral-flexion-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=lcI12UTpxgY',
        title: 'Exercise Tutorial: 1 Arm Dumbbell Side Bend',
        creator: 'Travis Tarrant',
      },
    ],
  },
  'co-band-lateral-side-bend': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=6CFUjpc6eTg',
        title: 'Obliques: Resistance Band Side Bend',
        creator: 'Fit Gent',
      },
    ],
  },
  'co-bw-anti-rotation-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=NV55raYCP0E',
        title: 'How to Do Plank Shoulder Taps (Core Stability + Control)',
        creator: 'Nottingham Physio',
      },
    ],
  },
  'trx-pallof-press': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=fxqQTxszgBI',
        title: 'TRX Pallof Press',
        creator: 'UPTaustin',
      },
    ],
  },
  'co-bb-landmine-rotation': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=D5x2hY8H91c',
        title: 'Landmine Rotational Press',
        creator: 'Testosterone Nation',
      },
    ],
  },
  'co-band-half-kneeling-anti-rotation': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Eux6CbS-SeY',
        title: 'Half Kneeling Anti Rotation Press',
        creator: 'ONYX Elite Fitness',
      },
    ],
  },
  'co-prone-ytw-raise': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=R6hm0NI_e58',
        title: 'YTW Raise',
        creator: 'Sequence App',
      },
    ],
  },
  'co-bench-reverse-hyper': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=aDAybdiLNCw',
        title: 'Reverse Hyperextension - Bench',
        creator: 'Dr. Christy Lee',
      },
    ],
  },
  'ol-bb-jefferson-curl': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=lHybIJtacgU',
        title: 'Jefferson Curl | Olympic Weightlifting Exercise Library',
        creator: 'Catalyst Athletics',
      },
    ],
  },
  'co-kb-superman-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Q-dJAfRALeg',
        title: 'Superman Hold | Bodyweight Exercise Tutorial | Kettlebells and Conditioning',
        creator: 'Peter Forneck',
      },
    ],
  },
  'co-db-superman-hold': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=_maNmOWamSc',
        title: 'Weighted Superman | Functional | Strength and Conditioning Exercises',
        creator: 'Rehab My Patient',
      },
    ],
  },
  'co-band-oblique-crunch': {
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=S5D8P7FkRps',
        title: 'Standing Band Oblique Crunch',
        creator: 'Testosterone Nation',
      },
    ],
  },
  'ca-db-shadow-boxing-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-dumbbell-shadow-boxing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=br8VDXWr0_8',
        title: 'Shadow-Boxing Workout For Seriously Toned Abs & Arms',
        creator: 'PS Fit',
      },
    ],
  },
  'ca-armbike-steady': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-armbike-steady-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=u-79qnFnY98',
        title: 'How to Use the Arm Bike Machine for Cardio Exercise',
        creator: 'ExpertVillage Leaf Group',
      },
    ],
  },
  'ca-rope-skipping-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-rope-skipping-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=ERG5PPDS_g8',
        title: '30 Sec Interval Jump Rope Workout (HIIT)',
        creator: 'Jump Rope Dudes',
      },
    ],
  },
  'ca-broad-jump-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-broad-jump-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=AOkmLTD8J24',
        title: 'Broad Jump | Olympic Weightlifting Exercise Library',
        creator: 'Catalyst Athletics',
      },
    ],
  },
  'ca-ski-erg-sprint-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-ski-erg-sprints-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=zD6R5hdE_8Y',
        title: 'SkiErg Tutorial - 4: How to Sprint and Go Faster',
        creator: 'Dark Horse Rowing',
      },
    ],
  },
  'ca-kb-single-arm-swing-intervals': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-single-arm-kettlebell-swing-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=axaCQqM0R1k',
        title: 'The Ultimate Single Arm Kettlebell Swing Tutorial',
        creator: 'Pat Damiano',
      },
    ],
  },
  'ca-aero-step-touch': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-step-touch-form-guide.webp'))],
  },
  'ca-aero-grapevine': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-grapevine-form-guide.webp'))],
  },
  'ca-aero-box-step': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-box-step-form-guide.webp'))],
  },
  'ca-aero-heel-toe-tap': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-heel-toe-tap-form-guide.webp'))],
  },
  'ca-aero-knee-lift-twist': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-knee-lift-twist-form-guide.webp'))],
  },
  'ca-aero-low-impact-jack': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-low-impact-jack-form-guide.webp'))],
  },
  'ca-aero-reach-side-bend': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-reach-side-bend-form-guide.webp'))],
  },
  'ca-aero-step-basic': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-basic-step-form-guide.webp'))],
  },
  'ca-aero-step-touch-on-step': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-step-touch-on-step-form-guide.webp'))],
  },
  'ca-aero-step-knee-repeater': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-step-knee-repeater-form-guide.webp'))],
  },
  'ca-aero-step-straddle-down': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-straddle-down-form-guide.webp'))],
  },
  'ca-aero-step-v-step': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-v-step-form-guide.webp'))],
  },
  'ca-aero-kick-jab-cross': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-jab-cross-form-guide.webp'))],
  },
  'ca-aero-kick-front-kick': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-front-kick-form-guide.webp'))],
  },
  'ca-aero-kick-hook-knee': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-hook-knee-form-guide.webp'))],
  },
  'ca-aero-kick-squat-punch': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-aero-squat-punch-form-guide.webp'))],
  },
  'wu-jumping-jack-slow': {
    stills: [formGuide(require('../../../assets/images/exercises/warmup-slow-jumping-jacks-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=RKwqhOcHLbE',
        title: 'How To Do: JUMPING JACKS',
        creator: 'Global Fitness Club',
      },
    ],
  },
  'mob-doorway-bicep-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-doorway-biceps-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=B9uY01NoqBg',
        title: 'Doorway Stretch',
        creator: 'Baptist Health',
      },
    ],
  },
  'yg-single-leg-balance-reach': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-single-leg-balance-reach-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=TShLyAkKU9c',
        title: 'Single Leg Balance and Reach Exercise',
        creator: 'TrainingTrendz',
      },
    ],
  },
  'yf-warrior-3': {
    stills: [formGuide(require('../../../assets/images/exercises/yoga-warrior3-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=L3BZeR_z2cQ',
        title: 'How to Do WARRIOR 3 - Yoga Pose Tutorial',
        creator: 'YOGA UPLOAD with Maris Aylward',
      },
    ],
  },
  'mob-figure4-balance-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-standing-figure-four-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=uikhOx-AvxI',
        title: 'How To Do A STANDING FIGURE 4 STRETCH | Exercise Demonstration Video and Guide',
        creator: 'Live Lean TV Daily Exercises',
      },
    ],
  },
  'mob-childs-pose': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-childs-pose-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=kH12QrSGedM',
        title: 'Child Pose',
        creator: 'Baptist Health',
      },
    ],
  },
  'mob-plantar-calf-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-reverse-lunge-calf-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=Rxmg957qC_s',
        title: 'How To Do Lunging Calf Stretch | Stretching Demo',
        creator: 'OriGym',
      },
    ],
  },
  'mob-doorway-lunge-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/stretch-doorway-lunge-chest-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/shorts/O8rJw_TmC1Y',
        title: 'Doorway Chest Stretch - Pectoralis Major and Minor exercise',
        creator: 'Rehab Hero',
      },
    ],
  },
  'ca-machine-steady': {
    clips: [
      {
        url: 'https://www.youtube.com/shorts/Wcclqt7tRt8',
        title: 'Steady State Cardio',
        creator: 'Bigronjones',
      },
    ],
  },
  'ca-treadmill-sprints': {
    stills: [formGuide(require('../../../assets/images/exercises/cardio-treadmill-sprints-form-guide.webp'))],
    clips: [
      {
        url: 'https://www.youtube.com/watch?v=GxkWIKuH21U',
        title: 'Sprint Interval Training: Incline Treadmill | Speed Endurance Workout',
        creator: 'Simple Speed Coach',
      },
    ],
  },
  'br-first-position-stance': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-first-position-form-guide.webp'))],
  },
  'br-arm-circles': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-arm-circles-form-guide.webp'))],
  },
  'br-marching-warmup': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-marching-form-guide.webp'))],
  },
  'br-seated-leg-circles': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-seated-leg-circles-form-guide.webp'))],
  },
  'br-standing-forward-fold': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-forward-fold-form-guide.webp'))],
  },
  'br-quad-stretch-barre': {
    stills: [formGuide(require('../../../assets/images/exercises/barre-quad-stretch-form-guide.webp'))],
  },
  'co-hundred': {
    stills: [formGuide(require('../../../assets/images/exercises/co-hundred-form-guide.webp'))],
  },
  'co-roll-up': {
    stills: [formGuide(require('../../../assets/images/exercises/co-roll-up-form-guide.webp'))],
  },
  'co-single-leg-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/co-single-leg-stretch-form-guide.webp'))],
  },
  'co-double-leg-stretch': {
    stills: [formGuide(require('../../../assets/images/exercises/co-double-leg-stretch-form-guide.webp'))],
  },
  'co-swimming': {
    stills: [formGuide(require('../../../assets/images/exercises/co-swimming-form-guide.webp'))],
  },
  'co-saw': {
    stills: [formGuide(require('../../../assets/images/exercises/co-saw-form-guide.webp'))],
  },
  'co-teaser': {
    stills: [formGuide(require('../../../assets/images/exercises/co-teaser-form-guide.webp'))],
  },
};
