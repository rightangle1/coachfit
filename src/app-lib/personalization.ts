import { bodyProfileOf, estimateSessionCalories } from '@/domain/metrics';
import type { AthleteProfile, Modality, SessionRecord, TrainingGoals } from '@/domain/types';

export interface GoalStory {
  key: Modality;
  label: string;
  shortLabel: string;
  headline: string;
  promise: string;
  payoffLabel: string;
}

export const GOAL_STORIES: Record<Modality, GoalStory> = {
  strength: {
    key: 'strength',
    label: 'Build strength & muscle',
    shortLabel: 'Strength',
    headline: 'Build strength that shows.',
    promise: 'Progressive sessions put measurable strength gains at the center of your plan.',
    payoffLabel: 'volume lifted',
  },
  cardio: {
    key: 'cardio',
    label: 'Improve cardio & endurance',
    shortLabel: 'Endurance',
    headline: 'Go farther. Feel stronger.',
    promise: 'Conditioning time and endurance trends make every bit of stamina visible.',
    payoffLabel: 'cardio minutes',
  },
  mobility: {
    key: 'mobility',
    label: 'Move with more freedom',
    shortLabel: 'Mobility',
    headline: 'Move better, every day.',
    promise: 'Purposeful mobility work keeps range, comfort, and consistency in focus.',
    payoffLabel: 'mobility sessions',
  },
  general: {
    key: 'general',
    label: 'Burn fat & feel fitter',
    shortLabel: 'Fat burn',
    headline: 'Make every session count.',
    promise: 'Calorie burn and consistent weekly work stay visible as your fitness builds.',
    payoffLabel: 'calories burned',
  },
};

const GOAL_ORDER: Modality[] = ['strength', 'general', 'cardio', 'mobility'];

export function primaryGoal(goals?: TrainingGoals): Modality {
  if (!goals) return 'general';
  return GOAL_ORDER.reduce((best, goal) =>
    (goals.weights[goal] ?? 0) > (goals.weights[best] ?? 0) ? goal : best,
  );
}

export function goalWeekPayoff(
  goal: Modality,
  history: SessionRecord[],
  athlete?: Pick<AthleteProfile, 'bodyweightKg' | 'weightUnit'> | null,
  now = Date.now(),
): { value: string; label: string; detail: string } {
  const recent = history.filter(
    (record) => record.completedAt != null && now - record.completedAt < 7 * 86_400_000,
  );

  if (goal === 'general') {
    const calories = recent.reduce(
      (sum, record) => sum + estimateSessionCalories(record, bodyProfileOf(athlete)).totalKcal,
      0,
    );
    return {
      value: calories ? calories.toLocaleString() : '0',
      label: 'KCAL THIS WEEK',
      detail: calories ? 'Energy burned across your completed sessions' : 'Your burn total starts with your first workout',
    };
  }

  if (goal === 'strength') {
    const volume = recent.reduce(
      (sessionSum, record) => sessionSum + record.performed.reduce(
        (exerciseSum, exercise) => exerciseSum + exercise.sets.reduce(
          (setSum, set) => setSum + (set.completed && set.reps && set.weightKg ? set.reps * set.weightKg : 0),
          0,
        ),
        0,
      ),
      0,
    );
    const rounded = Math.round(volume);
    const unit = athlete?.weightUnit ?? 'kg';
    const displayVolume = unit === 'lb' ? Math.round(rounded * 2.2046226218) : rounded;
    return {
      value: displayVolume >= 1000 ? `${(displayVolume / 1000).toFixed(1)}k` : String(displayVolume),
      label: `${unit.toUpperCase()} LIFTED THIS WEEK`,
      detail: rounded ? 'Every completed weighted rep moves this total' : 'Your strength total starts with your first lift',
    };
  }

  if (goal === 'cardio') {
    const seconds = recent.reduce(
      (sessionSum, record) => sessionSum + record.performed.reduce(
        (exerciseSum, exercise) => exerciseSum + exercise.sets.reduce(
          (setSum, set) => setSum + (set.completed ? set.durationSec ?? 0 : 0),
          0,
        ),
        0,
      ),
      0,
    );
    const minutes = Math.round(seconds / 60);
    return {
      value: String(minutes),
      label: 'CARDIO MIN THIS WEEK',
      detail: minutes ? 'Focused conditioning time completed' : 'Your endurance clock starts with your first session',
    };
  }

  const sessions = recent.filter((record) => record.workoutType === 'stretch' || record.workoutType === 'yoga').length;
  return {
    value: String(sessions),
    label: 'MOBILITY SESSIONS',
    detail: sessions ? 'Dedicated movement sessions this week' : 'Your mobility streak starts with your first flow',
  };
}
