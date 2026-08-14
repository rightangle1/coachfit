import { act, renderHook } from '@testing-library/react-native';

import { useGuidedFlowPlayer } from '../guided-flow-player';
import type { GuidedFlowStep } from '@/domain/engine';

// `guided-flow-player` pulls in the `@/design` barrel, which reaches
// `exercise-media.tsx` -> `video-embed.native.tsx` -> `react-native-webview`
// (a native module not registered under Jest) purely transitively — nothing
// in this hook touches video embeds. First test to import anything from that
// chain, so there's no existing repo-wide mock for it to reuse.
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-audio', () => ({ useAudioPlayer: () => ({ seekTo: jest.fn(), play: jest.fn() }) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
}));
jest.mock('@/services/exercise-preferences', () => ({ isTimerSoundEnabled: () => false }));

function step(exerciseId: string, durationSec: number, round = 0, roundCount = 1): GuidedFlowStep {
  return { exerciseId, setIndex: round, label: exerciseId, durationSec, pattern: 'stretch', round, roundCount };
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useGuidedFlowPlayer', () => {
  it('auto-advances to the next step when a step\'s countdown reaches zero', async () => {
    const steps = [step('a', 1), step('b', 1)];
    const onStepComplete = jest.fn();
    const onAllComplete = jest.fn();
    const { result } = await renderHook(() =>
      useGuidedFlowPlayer(steps, { startIndex: 0, paused: false, onStepComplete, onStepSkip: jest.fn(), onAllComplete }),
    );

    expect(result.current.step?.exerciseId).toBe('a');
    await act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(onStepComplete).toHaveBeenCalledWith(steps[0]);
    expect(result.current.step?.exerciseId).toBe('b');
    expect(onAllComplete).not.toHaveBeenCalled();
  });

  it('calls onAllComplete once the last step finishes', async () => {
    const steps = [step('a', 1)];
    const onAllComplete = jest.fn();
    await renderHook(() =>
      useGuidedFlowPlayer(steps, { startIndex: 0, paused: false, onStepComplete: jest.fn(), onStepSkip: jest.fn(), onAllComplete }),
    );

    await act(() => {
      jest.advanceTimersByTime(1100);
    });

    expect(onAllComplete).toHaveBeenCalledTimes(1);
  });

  it('freezes the countdown while paused instead of continuing to tick', async () => {
    const steps = [step('a', 5)];
    const { result, rerender } = await renderHook(
      ({ paused }: { paused: boolean }) => useGuidedFlowPlayer(steps, { startIndex: 0, paused, onStepComplete: jest.fn(), onStepSkip: jest.fn(), onAllComplete: jest.fn() }),
      { initialProps: { paused: false } },
    );

    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toBe(3);

    await rerender({ paused: true });
    await act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(result.current.remaining).toBe(3);

    await rerender({ paused: false });
    await act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current.remaining).toBe(2);
  });

  it('skipForward marks the current step skipped (not completed) and advances immediately', async () => {
    const steps = [step('a', 30), step('b', 30)];
    const onStepSkip = jest.fn();
    const onStepComplete = jest.fn();
    const { result } = await renderHook(() =>
      useGuidedFlowPlayer(steps, { startIndex: 0, paused: false, onStepComplete, onStepSkip, onAllComplete: jest.fn() }),
    );

    await act(() => {
      result.current.skipForward();
    });

    expect(onStepSkip).toHaveBeenCalledWith(steps[0]);
    expect(onStepComplete).not.toHaveBeenCalled();
    expect(result.current.step?.exerciseId).toBe('b');
  });

  it('skipBack is pure navigation — no callback fires', async () => {
    const steps = [step('a', 30), step('b', 30)];
    const onStepComplete = jest.fn();
    const onStepSkip = jest.fn();
    const { result } = await renderHook(() =>
      useGuidedFlowPlayer(steps, { startIndex: 1, paused: false, onStepComplete, onStepSkip, onAllComplete: jest.fn() }),
    );

    expect(result.current.step?.exerciseId).toBe('b');
    await act(() => {
      result.current.skipBack();
    });

    expect(result.current.step?.exerciseId).toBe('a');
    expect(onStepComplete).not.toHaveBeenCalled();
    expect(onStepSkip).not.toHaveBeenCalled();
  });
});
