'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Play, ArrowRight } from 'lucide-react';
import { useDemo } from '@/lib/demo-context';
import { useReducedMotion } from './use-reduced-motion';
import { useWalkthrough } from './use-walkthrough';
import { TerminalShell } from './terminal-shell';
import { TypingLine } from './typing-line';
import { OutputBlock } from './output-block';
import { WALKTHROUGH_STEPS } from './walkthrough-script';
import type { WalkthroughStep } from './walkthrough-script';

function StaticStep({ step }: { step: WalkthroughStep }) {
  if (step.type === 'typing') {
    return (
      <div>
        {step.prompt && <span className="text-emerald-400">{step.prompt}</span>}
        <span>{step.text}</span>
      </div>
    );
  }
  if (step.type === 'output') {
    return (
      <div>
        {(step.lines ?? []).map((line, i) => (
          <div key={i}>{line || '\u00A0'}</div>
        ))}
      </div>
    );
  }
  return null;
}

export function TerminalDemo() {
  const { enterDemo } = useDemo();
  const router = useRouter();
  const reducedMotion = useReducedMotion();
  const [reducedMotionActive, setReducedMotionActive] = useState(false);

  const handleGoToDashboard = useCallback(() => {
    enterDemo();
    router.push('/overview');
  }, [enterDemo, router]);

  const noop = useCallback(() => {}, []);
  const { state, currentStep, completedSteps, start, markStepDone } =
    useWalkthrough(noop);

  const handleStart = () => {
    if (reducedMotion) {
      setReducedMotionActive(true);
    } else {
      start();
    }
  };

  const isIdle = state === 'idle' && !reducedMotionActive;
  const isRunning = state === 'running' || reducedMotionActive;
  const isComplete = state === 'complete';

  return (
    <section className="px-4 py-16 md:px-6">
      <div className="mx-auto max-w-2xl">
        <h2 className="font-heading text-center text-2xl font-bold text-white md:text-3xl mb-8">
          See It in Action
        </h2>

        <TerminalShell title="feelr">
          {/* Completed steps */}
          {completedSteps.map((step, i) => (
            <StaticStep key={i} step={step} />
          ))}

          {/* Current step (animated) */}
          {state === 'running' && currentStep && (
            <>
              {currentStep.type === 'typing' && (
                <TypingLine
                  prompt={currentStep.prompt}
                  text={currentStep.text ?? ''}
                  speed={currentStep.duration}
                  onComplete={markStepDone}
                />
              )}
              {currentStep.type === 'output' && (
                <OutputBlock
                  lines={currentStep.lines ?? []}
                  onComplete={markStepDone}
                />
              )}
            </>
          )}

          {/* Reduced motion: show all steps statically */}
          {reducedMotionActive && (
            <>
              {WALKTHROUGH_STEPS.map((step, i) => (
                <StaticStep key={i} step={step} />
              ))}
              <div className="mt-2 text-zinc-500">Demo ready — explore the dashboard below.</div>
            </>
          )}

          {/* Idle placeholder */}
          {isIdle && (
            <div className="text-zinc-500">
              Click &quot;Try Demo&quot; to watch Feelr in action...
            </div>
          )}

          {/* Complete state: completedSteps already includes all steps via hook */}
        </TerminalShell>

        {/* CTA Button */}
        <div className="mt-6 flex justify-center">
          {isIdle && (
            <button
              type="button"
              onClick={handleStart}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-500"
            >
              <Play className="h-4 w-4" />
              Try Demo
            </button>
          )}
          {isRunning && (
            <button
              type="button"
              disabled
              className="inline-flex items-center gap-2 rounded-lg bg-zinc-700 px-6 py-3 font-medium text-white cursor-not-allowed"
            >
              Watching...
            </button>
          )}
          {(isComplete || reducedMotionActive) && (
            <button
              type="button"
              onClick={handleGoToDashboard}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 font-medium text-white transition-colors hover:bg-emerald-500"
            >
              Explore Dashboard
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
