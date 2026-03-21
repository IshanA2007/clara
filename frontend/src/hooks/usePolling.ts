import { useState, useEffect, useRef } from 'react';
import { getStatus } from '../api/client';
import type { ProcessingStage } from '../types';

interface UsePollingReturn {
  stage: ProcessingStage | null;
  currentStep: number;
  totalSteps: number;
  isComplete: boolean;
  isFailed: boolean;
  errorMessage: string | null;
}

export function usePolling(presentationId: string | null): UsePollingReturn {
  const [stage, setStage] = useState<ProcessingStage | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(5);
  const [isComplete, setIsComplete] = useState(false);
  const [isFailed, setIsFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!presentationId) return;

    const poll = async () => {
      try {
        const res = await getStatus(presentationId);

        if (res.status === 'processing') {
          setStage(res.stage);
          setCurrentStep(res.progress.current_step);
          setTotalSteps(res.progress.total_steps);
        } else if (res.status === 'completed') {
          setIsComplete(true);
          if (intervalRef.current) clearInterval(intervalRef.current);
        } else if (res.status === 'failed') {
          setIsFailed(true);
          setErrorMessage(res.message);
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      } catch {
        setIsFailed(true);
        setErrorMessage('Lost connection to server');
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    };

    poll();
    intervalRef.current = setInterval(poll, 2000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [presentationId]);

  return { stage, currentStep, totalSteps, isComplete, isFailed, errorMessage };
}
