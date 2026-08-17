import { readFileSync, writeFileSync } from 'node:fs';

const catalogPath = new URL('../src/domain/catalog/exercises.ts', import.meta.url);
const outputPath = new URL('../docs/STRENGTH_GENERAL_FORM_GUIDE_MANIFEST.json', import.meta.url);
const source = readFileSync(catalogPath, 'utf8');

const personas = [
  { id: 'aisha', name: 'Aisha', identity: 'Black woman', wardrobe: 'deep teal fitted training top, black leggings, black trainers', reference: 'art-source/exercise-models/aisha-reference.png', referenceStatus: 'queued' },
  { id: 'daniel', name: 'Daniel', identity: 'East Asian man', wardrobe: 'slate fitted training tee, black shorts, black trainers', reference: 'art-source/exercise-models/daniel-reference.png', referenceStatus: 'queued' },
  { id: 'priya', name: 'Priya', identity: 'South Asian woman', wardrobe: 'plum fitted training top, charcoal leggings, black trainers', reference: 'art-source/exercise-models/priya-reference.png', referenceStatus: 'queued' },
  { id: 'mateo', name: 'Mateo', identity: 'Latino man', wardrobe: 'forest green fitted training tee, black shorts, black trainers', reference: 'art-source/exercise-models/mateo-reference.png', referenceStatus: 'queued' },
  { id: 'elena', name: 'Elena', identity: 'white woman', wardrobe: 'rust fitted training top, charcoal leggings, black trainers', reference: 'art-source/exercise-models/elena-reference.png', referenceStatus: 'queued' },
  { id: 'amir', name: 'Amir', identity: 'Middle Eastern man', wardrobe: 'navy fitted training tee, black shorts, black trainers', reference: 'art-source/exercise-models/amir-reference.png', referenceStatus: 'queued' },
];

const patternGuidance = {
  squat: { stages: 'Two stages: controlled loaded bottom position and tall finish.', callouts: ['CHEST TALL', 'KNEES TRACK TOES', 'FULL FOOT DOWN'], arrow: 'Vertical gold arrow from the hips lowering into the squat through the tall standing finish.' },
  hinge: { stages: 'Two stages: hip hinge/loading position and tall glute-driven finish.', callouts: ['HINGE AT HIPS', 'LONG NEUTRAL SPINE', 'DRIVE THROUGH HIPS'], arrow: 'Gold arc from the hips back into the hinge and forward/up to the tall finish.' },
  lunge: { stages: 'Two stages: split-stance lowering position and controlled return to standing.', callouts: ['TALL TORSO', 'KNEE TRACKS TOES', 'CONTROL THE RETURN'], arrow: 'Gold down-and-up arrow through the front hip and knee path.' },
  push: { stages: 'Two stages only when the movement has a clear loaded and pressed position; otherwise show the clearest working position.', callouts: ['RIBS STACKED', 'CONTROL THE LOAD', 'MOVE WITH CONTROL'], arrow: 'Gold arrow follows the pressing path away from the body or floor.' },
  pull: { stages: 'Show the set position and the controlled pull finish when the range is meaningful.', callouts: ['SHOULDERS DOWN', 'CONTROL THE RETURN', 'MOVE WITH CONTROL'], arrow: 'Gold arrow follows the handle, bar, or body toward the intended pull finish.' },
  carry: { stages: 'One three-quarter walking position with a faint preceding foot placement only if it clarifies travel.', callouts: ['TALL POSTURE', 'BRACED CORE', 'WALK CONTROLLED'], arrow: 'Gold forward arrow at ground level in the travel direction.' },
  core: { stages: 'Use two stages only for a distinct trunk or limb transition; otherwise show the stable working position.', callouts: ['BRACE THE CORE', 'KEEP NECK LONG', 'MOVE WITH CONTROL'], arrow: 'Gold arrow follows the moving limb or controlled trunk path.' },
  barre_flow: { stages: 'Show the start and the small controlled working range without exaggerating the range.', callouts: ['TALL POSTURE', 'SMALL CONTROLLED RANGE', 'LIGHT SUPPORT'], arrow: 'Gold arrow follows the exact small pulse or limb path.' },
  pilates_flow: { stages: 'Show the set position and clear finish only where needed; preserve a long, controlled Pilates line.', callouts: ['RIBS CONNECTED', 'LONG SPINE', 'MOVE WITH CONTROL'], arrow: 'Gold arrow follows the precise controlled body path.' },
};

const equipmentCallout = (equipment) => {
  if (equipment.includes('barbell')) return 'BAR OVER MIDFOOT';
  if (equipment.includes('dumbbells')) return 'WEIGHTS CONTROLLED';
  if (equipment.includes('kettlebell')) return 'BELL STAYS CLOSE';
  if (equipment.includes('cable_machine')) return 'CABLE ANCHORED';
  if (equipment.includes('resistance_bands')) return 'BAND SECURE';
  if (equipment.includes('suspension_trainer')) return 'STRAPS TENSIONED';
  if (equipment.includes('pull_up_bar')) return 'GRIP SECURE';
  if (equipment.includes('bench')) return 'BENCH STABLE';
  if (equipment.includes('barre')) return 'LIGHT BARRE HOLD';
  return null;
};

const blocks = source.split(/\n  \{\n/).slice(1).map((block) => block.slice(0, block.indexOf('\n  },')));
const get = (block, expression) => block.match(expression)?.[1] ?? '';
const entries = blocks.map((block) => ({
  id: get(block, /id: '([^']+)'/),
  name: get(block, /name: '([^']+)'/),
  modality: get(block, /modality: '([^']+)'/),
  movementPattern: get(block, /movementPattern: '([^']+)'/),
  equipment: get(block, /equipment: \[([^\]]*)\]/).match(/'([^']+)'/g)?.map((value) => value.slice(1, -1)) ?? [],
  steps: get(block, /steps: \[([\s\S]*?)\n    \],/).match(/'([^']+)'/g)?.map((value) => value.slice(1, -1)) ?? [],
  cues: get(block, /cues: '([^']+)'/),
})).filter((entry) => entry.id && (entry.modality === 'strength' || entry.modality === 'general'));

const records = entries.map((entry, index) => {
  const guidance = patternGuidance[entry.movementPattern] ?? patternGuidance.core;
  const equipmentCue = equipmentCallout(entry.equipment);
  return {
    id: entry.id,
    exerciseName: entry.name,
    modality: entry.modality,
    movementPattern: entry.movementPattern,
    output: `assets/images/exercises/${entry.id}-form-guide.png`,
    persona: personas[index % personas.length],
    equipment: entry.equipment,
    exactSetupAndAction: entry.steps,
    catalogCue: entry.cues,
    scene: entry.movementPattern === 'carry' ? 'Clean outdoor path in natural daylight; no visible brand marks.' : 'Warm beige studio with natural window light, charcoal floor or mat, and all named equipment fully visible.',
    stages: guidance.stages,
    callouts: equipmentCue ? [equipmentCue, ...guidance.callouts].slice(0, 4) : guidance.callouts,
    arrow: guidance.arrow,
    status: 'queued',
    retryCount: 0,
    lastUpdatedAt: null,
    failureReason: null,
  };
});

if (records.length !== 353) throw new Error(`Expected 353 strength/general records, received ${records.length}.`);

writeFileSync(outputPath, `${JSON.stringify({
  version: 1,
  generatedAt: new Date().toISOString(),
  sharedArtDirection: 'Portrait 2:3 photorealistic CoachFit instructional card. Warm beige studio, natural window light, charcoal mat/floor where appropriate, warm-cream rounded callout boxes, thin gold leader lines, exactly one gold motion arrow, no title, logos, watermarks, step numbers, medical claims, anatomical overlays, or extra text. Keep the whole body and every named prop visible. Use only the exact callout text for the record.',
  personas,
  records,
}, null, 2)}\n`);
