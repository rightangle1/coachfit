/**
 * TrendChart — a themed bar/line chart built on `react-native-svg` (already a
 * dependency, used elsewhere for `MuscleFatigueMap` — no new charting
 * library). The one shared chart primitive for trends across the app,
 * replacing the ad hoc proportional-`View`-bar `Sparkline`/`LoadTrendBars`
 * functions that used to live inline in `progress.tsx`.
 *
 * ADR-0130 added the lighting pass: a gradient area fill under line series,
 * gradient bar fills, faint gridlines, a labelled endpoint, and a draw-on
 * animation. Everything is gated on the reduce-motion-aware `motion.enabled`.
 */

import { useEffect, useId } from 'react';
import { View } from 'react-native';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { timing } from '../motion';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

export interface TrendChartPoint {
  label: string;
  value: number;
}

export interface TrendChartProps {
  points: TrendChartPoint[];
  type?: 'bar' | 'line';
  color?: ColorToken;
  height?: number;
  valueFormatter?: (value: number) => string;
}

const CHART_WIDTH = 320; // viewBox unit — Svg scales it to the container's actual width
const GRIDLINES = 3;

/** One bar, growing up from the baseline. Its own component so each bar can
 *  own the hooks for its animation without breaking the rules of hooks. */
function Bar({
  x,
  y,
  width,
  baselineY,
  fill,
  progress,
  leading,
}: {
  x: number;
  y: number;
  width: number;
  baselineY: number;
  fill: string;
  progress: SharedValue<number>;
  leading: boolean;
}) {
  const fullHeight = Math.max(2, baselineY - y);
  const animatedProps = useAnimatedProps(() => ({
    y: baselineY - fullHeight * progress.get(),
    height: Math.max(0.01, fullHeight * progress.get()),
  }));
  return (
    <AnimatedRect
      x={x}
      y={y}
      width={width}
      height={fullHeight}
      rx={3}
      fill={fill}
      opacity={leading ? 1 : 0.55}
      animatedProps={animatedProps}
    />
  );
}

export function TrendChart({ points, type = 'bar', color = 'primary', height = 90, valueFormatter }: TrendChartProps) {
  const { colors, gradients, motion } = useTheme();
  const tint = colors[color];
  // SVG ids are document-global once react-native-svg renders real SVG on web,
  // so every chart instance needs its own or they cross-wire their fills.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const progress = useSharedValue(0);

  // Keyed on the series *content*, not the array identity: callers build
  // `points` inline, so an identity dep replayed the draw-on animation on every
  // unrelated re-render of the host screen (e.g. each chip tap in the Today
  // workout builder). The chart should only redraw when the data actually moves.
  const seriesKey = points.map((p) => `${p.label}:${p.value}`).join('|');

  useEffect(() => {
    progress.set(0);
    progress.set(withTiming(1, timing(motion.enabled, motion.duration.slower, 'decelerate')));
  }, [seriesKey, progress, motion.enabled, motion.duration.slower]);

  const max = Math.max(...points.map((p) => p.value), 1);
  const min = Math.min(0, ...points.map((p) => p.value));
  const range = Math.max(1, max - min);
  const padTop = 18; // room for the max-value label
  const padBottom = 16; // room for the first/last axis labels
  const chartHeight = height - padTop - padBottom;
  const stepX = CHART_WIDTH / Math.max(points.length, 1);
  const format = valueFormatter ?? ((v: number) => String(Math.round(v)));
  const yFor = (value: number) => padTop + chartHeight - ((value - min) / range) * chartHeight;
  const baselineY = yFor(min);

  const coords = points.map((p, i) => [i * stepX + stepX / 2, yFor(p.value)] as const);
  const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ');
  // Same polyline, closed down to the baseline, so the gradient has a shape to fill.
  const areaPath = coords.length
    ? `${linePath} L${coords[coords.length - 1][0]},${baselineY} L${coords[0][0]},${baselineY} Z`
    : '';
  const pathLength = coords.reduce((total, [x, y], i) => {
    if (i === 0) return 0;
    const [px, py] = coords[i - 1];
    return total + Math.hypot(x - px, y - py);
  }, 0);

  const lineProps = useAnimatedProps(() => ({
    strokeDashoffset: pathLength * (1 - progress.get()),
  }));
  const areaProps = useAnimatedProps(() => ({ opacity: progress.get() }));

  // Hooks must run unconditionally, so the empty check lands after them.
  if (points.length === 0) return null;

  const lastPoint = points[points.length - 1];

  return (
    <View>
      <Svg width="100%" height={height} viewBox={`0 0 ${CHART_WIDTH} ${height}`}>
        <Defs>
          <LinearGradient id={`area${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={gradients.chartArea.fromOpacity} />
            <Stop offset="1" stopColor={tint} stopOpacity={gradients.chartArea.toOpacity} />
          </LinearGradient>
          <LinearGradient id={`bar${uid}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={tint} stopOpacity={1} />
            <Stop offset="1" stopColor={tint} stopOpacity={0.55} />
          </LinearGradient>
        </Defs>

        {Array.from({ length: GRIDLINES }, (_, i) => {
          const y = padTop + (chartHeight / (GRIDLINES + 1)) * (i + 1);
          return <Line key={i} x1={0} y1={y} x2={CHART_WIDTH} y2={y} stroke={colors.border} strokeWidth={0.5} opacity={0.6} />;
        })}
        <Line x1={0} y1={baselineY} x2={CHART_WIDTH} y2={baselineY} stroke={colors.border} strokeWidth={1} />
        <Line x1={0} y1={padTop} x2={CHART_WIDTH} y2={padTop} stroke={colors.border} strokeWidth={1} strokeDasharray="2,3" />

        {type === 'bar'
          ? points.map((p, i) => {
              const barWidth = stepX * 0.5;
              return (
                <Bar
                  key={i}
                  x={i * stepX + (stepX - barWidth) / 2}
                  y={yFor(Math.max(p.value, min))}
                  width={barWidth}
                  baselineY={baselineY}
                  fill={`url(#bar${uid})`}
                  progress={progress}
                  leading={i === points.length - 1}
                />
              );
            })
          : (
              <>
                <AnimatedPath d={areaPath} fill={`url(#area${uid})`} animatedProps={areaProps} />
                <AnimatedPath
                  d={linePath}
                  stroke={tint}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  strokeDasharray={pathLength || undefined}
                  animatedProps={lineProps}
                />
                {coords.map(([x, y], i) => (
                  <Circle
                    key={i}
                    cx={x}
                    cy={y}
                    r={i === coords.length - 1 ? 4 : 3}
                    fill={tint}
                    opacity={i === coords.length - 1 ? 1 : 0.7}
                  />
                ))}
                {/* The latest value is the one people actually look for. */}
                <Circle
                  cx={coords[coords.length - 1][0]}
                  cy={coords[coords.length - 1][1]}
                  r={7}
                  fill={tint}
                  opacity={0.18}
                />
              </>
            )}

        <SvgText x={2} y={padTop - 6} fontSize={9} fill={colors.textFaint}>
          {format(max)}
        </SvgText>
        <SvgText x={2} y={height - 4} fontSize={9} fill={colors.textFaint}>
          {points[0].label}
        </SvgText>
        <SvgText x={CHART_WIDTH - 2} y={height - 4} fontSize={9} fill={colors.textFaint} textAnchor="end">
          {lastPoint.label}
        </SvgText>
      </Svg>
    </View>
  );
}
