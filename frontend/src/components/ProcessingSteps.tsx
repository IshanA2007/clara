import { motion, AnimatePresence } from 'motion/react';
import type { ProcessingStage } from '../types';

interface ProcessingStepsProps {
  currentStage: ProcessingStage | null;
}

const STAGES: { key: ProcessingStage; label: string }[] = [
  { key: 'received', label: 'Upload received' },
  { key: 'transcribing', label: 'Transcribing audio' },
  { key: 'indexing', label: 'Indexing transcript' },
  { key: 'analyzing', label: 'Analyzing patterns & generating feedback' },
  { key: 'aggregating', label: 'Combining results' },
];

function getStepState(
  stepIndex: number,
  activeIndex: number,
): 'completed' | 'active' | 'pending' {
  if (activeIndex < 0) return stepIndex === 0 ? 'active' : 'pending';
  if (stepIndex < activeIndex) return 'completed';
  if (stepIndex === activeIndex) return 'active';
  return 'pending';
}

function StepIcon({ state }: { state: 'completed' | 'active' | 'pending' }) {
  return (
    <div
      style={{
        width: 24,
        height: 24,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <AnimatePresence mode="wait">
        {state === 'completed' && (
          <motion.div
            key="check"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: 'var(--pace-normal)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M2.5 6L5 8.5L9.5 3.5"
                stroke="white"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </motion.div>
        )}
        {state === 'active' && (
          <motion.div
            key="pulse"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'processing-pulse 1.4s ease-in-out infinite',
            }}
          />
        )}
        {state === 'pending' && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              border: '1.5px solid var(--text-tertiary)',
              background: 'transparent',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ProcessingSteps({ currentStage }: ProcessingStepsProps) {
  const activeIndex = currentStage
    ? STAGES.findIndex((s) => s.key === currentStage)
    : -1;

  return (
    <>
      <style>{`
        @keyframes processing-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.85); }
        }
      `}</style>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          width: '100%',
          maxWidth: 380,
        }}
      >
        {STAGES.map((stage, i) => {
          const state = getStepState(i, activeIndex);
          const isLast = i === STAGES.length - 1;

          return (
            <div key={stage.key} style={{ display: 'flex', gap: 'var(--space-3)' }}>
              {/* Icon column with connecting line */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: 24,
                  flexShrink: 0,
                }}
              >
                <StepIcon state={state} />
                {!isLast && (
                  <div
                    style={{
                      width: 1.5,
                      flexGrow: 1,
                      minHeight: 16,
                      background:
                        state === 'completed'
                          ? 'var(--pace-normal)'
                          : 'var(--border-subtle)',
                      transition: 'background 0.3s ease',
                    }}
                  />
                )}
              </div>

              {/* Label */}
              <div
                style={{
                  paddingBottom: isLast ? 0 : 'var(--space-4)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  paddingTop: 2,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-base)',
                    color:
                      state === 'pending'
                        ? 'var(--text-tertiary)'
                        : 'var(--text-primary)',
                    fontWeight: state === 'active' ? 600 : 400,
                    transition: 'color 0.3s ease, font-weight 0.3s ease',
                  }}
                >
                  {stage.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
