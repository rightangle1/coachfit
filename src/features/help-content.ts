import type { IconName } from '@/design';

export type HelpDestination = 'today' | 'explore' | 'progress' | 'profile' | 'catalog' | 'equipment';

export interface HelpTopic {
  id: 'today' | 'plan' | 'reorder' | 'supersets' | 'catalog' | 'equipment' | 'metrics' | 'you';
  title: string;
  summary: string;
  body: string;
  icon: IconName;
  action?: { label: string; destination: HelpDestination };
}

/** The first-run tour and Settings Help hub read from this one source so their
 * terminology and destinations stay aligned as the app evolves. */
export const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: 'today',
    title: 'Today is your starting point',
    summary: 'One clear next session, shaped around you.',
    body: 'Today shows your weekly rhythm and recovery context before offering one clear next step. Build the recommended session, or adjust it only when you need to.',
    icon: 'target',
    action: { label: 'Open Today', destination: 'today' },
  },
  {
    id: 'plan',
    title: 'Your plan and defaults',
    summary: 'Where CoachFit gets its cues.',
    body: 'Your training profile sets your goals, experience, constraints, cadence, and preferred style. Workout defaults set whether a fresh build starts with a warm-up, conditioning, or cool-down. On Today, you can still tailor the workout you build for today.',
    icon: 'target',
    action: { label: 'Open plan settings', destination: 'profile' },
  },
  {
    id: 'reorder',
    title: 'Reorder a workout',
    summary: 'Use the drag handle in a workout plan.',
    body: 'After you build a workout, open its plan preview and drag an exercise by the ⠿ handle. Drop it above or below another exercise to change the order. Logged exercises stay in place so your completed workout remains accurate.',
    icon: 'rotation',
    action: { label: 'Open Today', destination: 'today' },
  },
  {
    id: 'supersets',
    title: 'Create or split a superset',
    summary: 'Drop onto an exercise to pair it.',
    body: 'Drop an exercise in the middle of another exercise to make or join a superset. CoachFit keeps the rounds aligned. To turn one back into a straight set, drag it outside its superset and drop it in the straight-set area.',
    icon: 'rotation',
    action: { label: 'Open Today', destination: 'today' },
  },
  {
    id: 'catalog',
    title: 'Explore movement',
    summary: 'Find form guidance and save movements you enjoy.',
    body: 'Explore is where you search by goal, body area, and equipment. Saved exercises gently influence equally suitable workouts; catalog exclusions remain available in You when you need them.',
    icon: 'favorite',
    action: { label: 'Open Explore', destination: 'explore' },
  },
  {
    id: 'equipment',
    title: 'Edit your equipment',
    summary: 'Keep recommendations practical.',
    body: 'Your equipment list filters workouts and replacements to what you can actually use. For dumbbells, kettlebells, and bands, you can also specify the loads or levels you own. Update it any time from Settings.',
    icon: 'workout',
    action: { label: 'Edit equipment', destination: 'equipment' },
  },
  {
    id: 'metrics',
    title: 'Progress tells a clear story',
    summary: 'Weight, consistency, and the signal that matters most.',
    body: 'Progress starts with a concise dashboard, then lets you drill into bodyweight, performance, and your training log. Every trend is personal to your own history—never a made-up fitness score.',
    icon: 'goalStrength',
    action: { label: 'Open Progress', destination: 'progress' },
  },
  {
    id: 'you',
    title: 'You keep your plan practical',
    summary: 'Profile, equipment, preferences, and help live here.',
    body: 'Use You to update your training profile, equipment, workout defaults, catalog exclusions, and help. Those preferences shape recommendations without interrupting everyday training.',
    icon: 'target',
    action: { label: 'Open You', destination: 'profile' },
  },
];

export const TOUR_TOPIC_IDS: readonly HelpTopic['id'][] = [
  'today',
  'catalog',
  'metrics',
  'you',
];

export function helpTopic(id: HelpTopic['id']): HelpTopic {
  const topic = HELP_TOPICS.find((candidate) => candidate.id === id);
  if (!topic) throw new Error(`Unknown help topic: ${id}`);
  return topic;
}
