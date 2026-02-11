'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { WALKTHROUGH_STEPS } from './walkthrough-script';

type WalkthroughState = 'idle' | 'running' | 'complete';

export function useWalkthrough(onComplete: () => void) {
  const [state, setState] = useState<WalkthroughState>('idle');
  const [stepIndex, setStepIndex] = useState(-1);
  const [stepDone, setStepDone] = useState(false);

  const onCompleteRef = useRef(onComplete);
  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const start = useCallback(() => {
    setState('running');
    setStepIndex(0);
    setStepDone(false);
  }, []);

  // Effect 1: step advancement
  useEffect(() => {
    if (state !== 'running' || !stepDone) return;

    const nextIndex = stepIndex + 1;
    if (nextIndex >= WALKTHROUGH_STEPS.length) {
      setState('complete');
      onCompleteRef.current();
    } else {
      setStepIndex(nextIndex);
      setStepDone(false);
    }
  }, [state, stepDone, stepIndex]);

  // Effect 2: pause handler
  useEffect(() => {
    if (state !== 'running') return;
    const step = stepIndex >= 0 ? WALKTHROUGH_STEPS[stepIndex] : null;
    if (!step || step.type !== 'pause') return;

    const timeout = setTimeout(() => {
      setStepDone(true);
    }, step.duration ?? 500);

    return () => {
      clearTimeout(timeout);
    };
  }, [state, stepIndex]);

  const currentStep = stepIndex >= 0 ? WALKTHROUGH_STEPS[stepIndex] ?? null : null;
  const completedSteps = WALKTHROUGH_STEPS.slice(0, stepIndex);

  return {
    state,
    currentStep,
    completedSteps,
    stepIndex,
    start,
    markStepDone: useCallback(() => setStepDone(true), []),
  };
}
