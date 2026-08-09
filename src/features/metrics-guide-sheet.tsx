/**
 * Metrics guide — a plain-language explainer of how the three Progress
 * metrics are calculated (ADR-0201 calories, ADR-0202 strength, ADR-0203
 * endurance), the per-exercise intensity model behind them (ADR-0123), and
 * where "overall" vs. "per-muscle" views live. Surfaces the ADRs' evidence
 * base to the athlete directly instead of leaving it buried in
 * `docs/decisions/`.
 */

import { Card, SheetModal, Text, useTheme } from '@/design';

export function MetricsGuideSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { spacing } = useTheme();

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      eyebrow="HOW WE CALCULATE"
      title="Your metrics"
      closeLabel="Close metrics guide"
    >
      <Card>
        <Text variant="heading">Calories</Text>
        <Text variant="body" style={{ marginTop: spacing.xs }}>
          MET × your bodyweight × time trained.
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          MET (metabolic equivalent) values come from the 2011 Compendium of
          Physical Activities — the same reference exercise scientists and
          fitness trackers use to estimate calorie burn. Where we’ve
          researched a real, exercise-specific MET (mostly cardio and
          conditioning moves — a burpee costs more than a round of shadow
          boxing, and now the number says so), we use it directly. Otherwise
          we fall back to a conservative estimate based on the exercise’s
          broad category (mobility, strength, core, or cardio), so every
          number scales with your bodyweight and how long you actually
          worked, never a generic guess.
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Exercise intensity</Text>
        <Text variant="body" style={{ marginTop: spacing.xs }}>
          Two honest signals, one for each kind of exercise.
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          Cardio and conditioning moves get a real MET value from the
          Compendium of Physical Activities where we’ve researched one — so a
          harder drill visibly costs more calories, effort, and recovery time
          than an easier one, even within the same category. Strength moves
          (think a dumbbell bench press vs. a dumbbell fly) don’t have
          per-exercise Compendium codes to draw on, so instead we rate how
          demanding a movement is on your body: whether it’s a compound,
          multi-joint lift or a single-joint isolation move, how much muscle
          mass it recruits, and whether it’s a single-limb, stability-heavy
          movement. That rating adjusts your rest time and how much the set
          counts toward next-day fatigue — never your prescribed reps or
          weight.
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Strength</Text>
        <Text variant="body" style={{ marginTop: spacing.xs }}>
          Estimated one-rep max, via the Epley formula.
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          The Epley formula is a standard way to estimate a true one-rep max
          from any weight-and-reps set, without you ever having to attempt an
          actual max lift. Your per-muscle-group number is the average of how
          close you are to your own best across every lift that trains that
          muscle — never a mix of different lifts’ absolute weights. Below it,
          your most-logged lift for that muscle is shown as its own weight
          estimate over time, so you always have one concrete number too.
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Endurance</Text>
        <Text variant="body" style={{ marginTop: spacing.xs }}>
          Two numbers, side by side.
        </Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          Cardio minutes is how much conditioning work you’re doing — simple
          time spent on cardio-style training. Training load is session RPE
          (how hard the whole session felt, 0–10) × minutes trained — a
          sports-science method (Foster’s session-RPE method) for how hard an
          entire session was, across any workout type, not just cardio.
        </Text>
      </Card>

      <Card>
        <Text variant="heading">Overall vs. per-muscle</Text>
        <Text variant="caption" color="textMuted" style={{ marginTop: spacing.sm }}>
          The at-a-glance tiles and weekly volume-load trend are whole-body
          views. Weekly volume by muscle group, the strength-by-muscle-group
          index, and the fatigue map are per-muscle — they tell you which
          specific areas are trained, growing, or still recovering.
        </Text>
      </Card>
    </SheetModal>
  );
}
