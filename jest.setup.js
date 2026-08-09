/**
 * Reanimated has no native runtime under Jest, so any component that imports it
 * fails to even load (ADR-0130). Its own shipped mock is not usable here — it
 * re-exports from the real entrypoint, which boots `react-native-worklets` and
 * throws — so this is a hand-rolled stand-in covering the surface the design
 * system uses.
 *
 * Semantics: animations resolve instantly to their target value, and animated
 * views render as plain ones with the animation-only props stripped. That is
 * what render assertions want — the final visual state, no timers.
 */
jest.mock('react-native-reanimated', () => {
  // Required inside the factory: Jest forbids module factories from closing
  // over out-of-scope variables.
  const React = require('react');
  const { View, Text, Image, ScrollView } = require('react-native');

  const ANIMATION_PROPS = ['entering', 'exiting', 'layout', 'sharedTransitionTag'];

  /** Strips animation-only props and folds `animatedProps` into real props. */
  const stripAnimationProps = (props) => {
    const next = { ...props };
    for (const key of ANIMATION_PROPS) delete next[key];
    const { animatedProps, ...rest } = next;
    return { ...rest, ...(animatedProps ?? {}) };
  };

  const createAnimatedComponent = (Component) => {
    const Wrapped = React.forwardRef((props, ref) =>
      React.createElement(Component, { ...stripAnimationProps(props), ref }),
    );
    Wrapped.displayName = `Animated(${Component?.displayName ?? Component?.name ?? 'Component'})`;
    return Wrapped;
  };

  // A shared value the app can read and write exactly as it does at runtime.
  const useSharedValue = (initial) => {
    const ref = React.useRef(null);
    if (ref.current === null) {
      ref.current = { value: initial, get: () => ref.current.value, set: (v) => { ref.current.value = v; } };
    }
    return ref.current;
  };

  // `withX` helpers resolve straight to the target value.
  const toValue = (value) => value;
  const withDelay = (_delay, value) => value;
  const withSequence = (...values) => values[values.length - 1];
  const withRepeat = (value) => value;

  const easingFn = (t) => t;
  easingFn.factory = () => easingFn;
  const Easing = {
    bezier: () => easingFn,
    linear: easingFn,
    ease: easingFn,
    quad: easingFn,
    cubic: easingFn,
    in: () => easingFn,
    out: () => easingFn,
    inOut: () => easingFn,
    back: () => easingFn,
  };

  // Layout animations are used as opaque markers; they get stripped on render.
  const layoutAnimation = () => {
    const builder = {};
    for (const method of ['duration', 'delay', 'springify', 'damping', 'stiffness', 'easing', 'withInitialValues', 'build']) {
      builder[method] = () => builder;
    }
    return builder;
  };
  const layoutAnimationNames = [
    'FadeIn', 'FadeInDown', 'FadeInUp', 'FadeInLeft', 'FadeInRight',
    'FadeOut', 'FadeOutDown', 'FadeOutUp', 'FadeOutLeft', 'FadeOutRight',
    'SlideInDown', 'SlideInUp', 'SlideOutDown', 'SlideOutUp',
    'ZoomIn', 'ZoomOut', 'LinearTransition', 'CurvedTransition',
  ];
  const layoutAnimations = Object.fromEntries(
    layoutAnimationNames.map((name) => [name, layoutAnimation()]),
  );

  const Animated = {
    View: createAnimatedComponent(View),
    Text: createAnimatedComponent(Text),
    Image: createAnimatedComponent(Image),
    ScrollView: createAnimatedComponent(ScrollView),
    createAnimatedComponent,
  };

  return {
    __esModule: true,
    default: Animated,
    ...Animated,
    ...layoutAnimations,
    useSharedValue,
    useAnimatedStyle: (fn) => fn(),
    useAnimatedProps: (fn) => fn(),
    useDerivedValue: (fn) => ({ value: fn(), get: fn }),
    useAnimatedRef: () => ({ current: null }),
    useAnimatedReaction: () => {},
    useReducedMotion: () => false,
    withTiming: toValue,
    withSpring: toValue,
    withDecay: toValue,
    withDelay,
    withSequence,
    withRepeat,
    cancelAnimation: () => {},
    runOnJS: (fn) => fn,
    runOnUI: (fn) => fn,
    interpolate: (value) => value,
    interpolateColor: (_value, _input, output) => output[0],
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    Easing,
  };
});
