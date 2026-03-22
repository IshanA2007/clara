import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { getResults, ApiClientError } from '../api/client';
import { useAppState, useAppActions } from '../context/AppContext';
import SlideViewer from '../components/SlideViewer';
import OverallMetrics from '../components/OverallMetrics';
import MetricsPanel from '../components/MetricsPanel';
import FeedbackPanel from '../components/FeedbackPanel';
import TranscriptPanel from '../components/TranscriptPanel';
import SlideCarousel from '../components/SlideCarousel';
import type { PresentationResults } from '../types';

export default function ResultsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pdfFile, results: contextResults } = useAppState();
  const { setResults, resetAll } = useAppActions();

  const [results, setLocalResults] = useState<PresentationResults | null>(contextResults);
  const [selectedSlideIndex, setSelectedSlideIndex] = useState(0);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!contextResults);

  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (contextResults) {
      setLocalResults(contextResults);
      setLoading(false);
      return;
    }

    if (!id) return;

    let cancelled = false;

    async function fetchResults() {
      try {
        const data = await getResults(id!);
        if (cancelled) return;
        setLocalResults(data);
        setResults(data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiClientError) {
          if (err.apiError.status === 'processing') {
            navigate('/processing', { replace: true });
            return;
          }
          if (err.apiError.error === 'not_found') {
            setError('not_found');
            setLoading(false);
            return;
          }
        }
        setError('unknown');
        setLoading(false);
      }
    }

    fetchResults();
    return () => { cancelled = true; };
  }, [id, contextResults, navigate, setResults]);

  const handleNewPresentation = useCallback(() => {
    resetAll();
    navigate('/setup');
  }, [resetAll, navigate]);

  const handleFillerClick = useCallback(() => {
    setTranscriptExpanded(true);
    requestAnimationFrame(() => {
      transcriptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const handlePauseClick = useCallback(() => {
    // pause expansion is handled inside MetricsPanel
  }, []);

  const handleSlideSelect = useCallback((index: number) => {
    setSelectedSlideIndex(index);
    setTranscriptExpanded(false);
  }, []);

  if (loading) {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className="loading-shimmer" style={{ width: 200, height: 24, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)' }} />
          <p style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading results…</p>
        </div>
      </div>
    );
  }

  if (error === 'not_found') {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
          Presentation not found
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
          This presentation doesn't exist or has expired.
        </p>
        <Link
          to="/"
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            fontSize: 'var(--text-base)',
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </div>
    );
  }

  if (error || !results) {
    return (
      <div
        className="bg-warm-gradient textured"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--text-2xl)', color: 'var(--text-primary)' }}>
          Something went wrong
        </h2>
        <Link
          to="/"
          style={{
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          &larr; Back to home
        </Link>
      </div>
    );
  }

  const slideKey = `slide_${selectedSlideIndex}`;
  const slide = results.slides[slideKey];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="bg-warm-gradient textured"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.12 } } }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-5)',
          padding: 'var(--space-5) var(--space-6)',
          maxWidth: 1400,
          width: '100%',
          margin: '0 auto',
          flex: 1,
        }}
      >
        {/* Zone 1: Overall Metrics */}
        <motion.div
          variants={zoneVariants}
        >
          <OverallMetrics
            metrics={results.overall_metrics}
            onNewPresentation={handleNewPresentation}
          />
        </motion.div>

        {/* Zone 2: Two-Column Split */}
        <motion.div
          variants={zoneVariants}
          className="results-grid"
          style={{
            flex: 1,
            minHeight: 0,
          }}
        >
          {/* Left: Slide Viewer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
              minWidth: 0,
            }}
          >
            <SlideViewer
              file={pdfFile}
              pageNumber={selectedSlideIndex + 1}
            />
            <div
              style={{
                marginTop: 'var(--space-3)',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Slide {selectedSlideIndex + 1} of {results.total_slides}
            </div>
          </div>

          {/* Right: Panels */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 'var(--space-4)',
              overflowY: 'auto',
              minHeight: 0,
            }}
          >
            <AnimatePresence mode="wait">
              <motion.div
                key={slideKey}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-4)',
                }}
              >
                {/* Metrics */}
                <section style={cardStyle}>
                  <h3 style={sectionHeadingStyle}>Metrics</h3>
                  {slide ? (
                    <MetricsPanel
                      metrics={slide.metrics}
                      duration={slide.duration_seconds}
                      onFillerClick={handleFillerClick}
                      onPauseClick={handlePauseClick}
                    />
                  ) : (
                    <p style={emptySlideStyle}>No data for this slide.</p>
                  )}
                </section>

                {/* Feedback */}
                <section style={cardStyle}>
                  <h3 style={sectionHeadingStyle}>Feedback</h3>
                  {slide ? (
                    <FeedbackPanel feedback={slide.feedback} />
                  ) : (
                    <p style={emptySlideStyle}>No feedback for this slide.</p>
                  )}
                </section>

                {/* Transcript */}
                <section ref={transcriptRef} style={cardStyle}>
                  <h3 style={sectionHeadingStyle}>Transcript</h3>
                  {slide ? (
                    <TranscriptPanel
                      transcript={slide.transcript}
                      fillerWords={slide.metrics.filler_words.instances}
                      expanded={transcriptExpanded}
                      onToggle={() => setTranscriptExpanded((p) => !p)}
                    />
                  ) : (
                    <p style={emptySlideStyle}>No transcript for this slide.</p>
                  )}
                </section>
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        {/* Zone 3: Slide Carousel */}
        <motion.div variants={zoneVariants}>
          <SlideCarousel
            totalSlides={results.total_slides}
            selectedIndex={selectedSlideIndex}
            onSelect={handleSlideSelect}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

const zoneVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
};

const cardStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  boxShadow: 'var(--shadow-sm)',
  borderRadius: 'var(--radius-lg)',
  padding: 'var(--space-5)',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--text-lg)',
  color: 'var(--text-primary)',
  marginBottom: 'var(--space-4)',
};

const emptySlideStyle: React.CSSProperties = {
  color: 'var(--text-tertiary)',
  fontSize: 'var(--text-sm)',
  fontStyle: 'italic',
};
