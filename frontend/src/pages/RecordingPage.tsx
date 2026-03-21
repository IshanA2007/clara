import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import SlideViewer from '../components/SlideViewer';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useAppState, useAppActions } from '../context/AppContext';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function RecordingPage() {
  const navigate = useNavigate();
  const { pdfFile, totalSlides } = useAppState();
  const { setRecordingData } = useAppActions();
  const { isRecording, elapsedSeconds, startRecording, stopRecording } = useAudioRecorder();

  const [currentSlide, setCurrentSlide] = useState(0);
  const slideTimestamps = useRef<number[]>([0.0]);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (!pdfFile) {
      navigate('/setup', { replace: true });
    }
  }, [pdfFile, navigate]);

  useEffect(() => {
    if (pdfFile && !hasStarted.current) {
      hasStarted.current = true;
      startRecording();
    }
  }, [pdfFile, startRecording]);

  const handleNext = useCallback(() => {
    if (currentSlide >= totalSlides - 1) return;
    slideTimestamps.current.push(elapsedSeconds);
    setCurrentSlide((prev) => prev + 1);
  }, [currentSlide, totalSlides, elapsedSeconds]);

  const handlePrev = useCallback(() => {
    if (currentSlide <= 0) return;
    setCurrentSlide((prev) => prev - 1);
  }, [currentSlide]);

  const handleEnd = useCallback(async () => {
    try {
      const blob = await stopRecording();
      setRecordingData(blob, slideTimestamps.current, totalSlides);
      navigate('/processing');
    } catch {
      navigate('/processing');
    }
  }, [stopRecording, setRecordingData, totalSlides, navigate]);

  if (!pdfFile) return null;

  const slideWidth = Math.min(window.innerWidth * 0.8, 800);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-base)',
        overflow: 'hidden',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'var(--space-4) var(--space-6)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {isRecording && <span className="recording-dot" />}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-lg)',
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {formatTime(elapsedSeconds)}
          </span>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-secondary)',
          }}
        >
          Slide {currentSlide + 1} / {totalSlides}
        </span>
      </header>

      {/* Center: Slide viewer */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: 0,
          padding: '0 var(--space-6)',
        }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <SlideViewer
              file={pdfFile}
              pageNumber={currentSlide + 1}
              width={slideWidth}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <footer
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
          padding: 'var(--space-4) var(--space-6) var(--space-5)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
          <button
            onClick={handlePrev}
            disabled={currentSlide <= 0}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              color: currentSlide <= 0 ? 'var(--text-tertiary)' : 'var(--text-primary)',
              background: currentSlide <= 0 ? 'var(--bg-recessed)' : 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-5)',
              cursor: currentSlide <= 0 ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
          >
            &larr; Prev
          </button>
          <button
            onClick={handleNext}
            disabled={currentSlide >= totalSlides - 1}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              fontWeight: 500,
              color: currentSlide >= totalSlides - 1 ? 'var(--text-tertiary)' : 'var(--text-on-dark)',
              background: currentSlide >= totalSlides - 1 ? 'var(--bg-recessed)' : 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-2) var(--space-5)',
              cursor: currentSlide >= totalSlides - 1 ? 'not-allowed' : 'pointer',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (currentSlide < totalSlides - 1)
                e.currentTarget.style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              if (currentSlide < totalSlides - 1)
                e.currentTarget.style.background = 'var(--accent)';
            }}
          >
            Next &rarr;
          </button>
        </div>

        <button
          onClick={handleEnd}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            color: 'var(--accent)',
            background: 'transparent',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-2) var(--space-5)',
            cursor: 'pointer',
            transition: 'all 150ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--accent)';
            e.currentTarget.style.color = 'var(--text-on-dark)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.color = 'var(--accent)';
          }}
        >
          End Presentation
        </button>
      </footer>
    </motion.div>
  );
}
