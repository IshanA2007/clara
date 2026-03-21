import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { pdfjs } from 'react-pdf';
import { useAppActions } from '../context/AppContext';
import ExpectationsForm from '../components/ExpectationsForm';
import type { PresentationExpectations } from '../types';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { setPdfFile, setTotalSlides, setExpectations } = useAppActions();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const totalSlidesRef = useRef(0);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [formValid, setFormValid] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const processFile = useCallback(
    async (f: File) => {
      setFileError('');

      if (f.type !== 'application/pdf') {
        setFileError('Only PDF files are accepted.');
        return;
      }
      if (f.size > MAX_FILE_SIZE) {
        setFileError(`File must be under 50 MB. Yours is ${formatBytes(f.size)}.`);
        return;
      }

      setFile(f);
      setPdfFile(f);

      try {
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: buf }).promise;
        totalSlidesRef.current = doc.numPages;
        setPageCount(doc.numPages);
        setTotalSlides(doc.numPages);
      } catch {
        setFileError('Could not read PDF. The file may be corrupted.');
        setFile(null);
      }
    },
    [setPdfFile, setTotalSlides],
  );

  const removeFile = () => {
    setFile(null);
    setPageCount(0);
    totalSlidesRef.current = 0;
    setTotalSlides(0);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragEnter = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) processFile(dropped);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) processFile(selected);
  };

  const handleExpectationsSubmit = (exp: PresentationExpectations) => {
    setExpectations(exp);
    navigate('/present');
  };

  const canSubmit = !!file && formValid;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-warm-gradient textured"
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: 'var(--space-7) var(--space-5)',
        position: 'relative',
      }}
    >
      <div
        style={{
          maxWidth: 640,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-6)',
        }}
      >
        {/* Back link */}
        <motion.div
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Link
            to="/"
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1)',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
          >
            &larr; Back to Home
          </Link>
        </motion.div>

        {/* Page heading */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-2xl)',
              color: 'var(--text-primary)',
              letterSpacing: '-0.01em',
              lineHeight: 1.15,
            }}
          >
            Prepare Your Session
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-base)',
              color: 'var(--text-secondary)',
              marginTop: 'var(--space-2)',
              lineHeight: 1.5,
            }}
          >
            Upload your slide deck and tell Clara what to listen for.
          </p>
        </motion.div>

        {/* PDF upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <label
            className="category-label"
            style={{
              color: 'var(--text-secondary)',
              display: 'block',
              marginBottom: 'var(--space-3)',
            }}
          >
            Slides
          </label>

          <AnimatePresence mode="wait">
            {!file ? (
              <motion.div
                key="dropzone"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
                onDragEnter={handleDragEnter}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: isDragging
                    ? '2px solid var(--accent)'
                    : '2px dashed var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-8) var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-3)',
                  cursor: 'pointer',
                  background: isDragging ? 'var(--accent-muted)' : 'transparent',
                  transition: 'border-color 200ms ease, background 200ms ease',
                }}
              >
                <motion.div
                  animate={isDragging ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                  transition={isDragging ? { repeat: Infinity, duration: 1.5, ease: 'easeInOut' } : {}}
                >
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={isDragging ? 'var(--accent)' : 'var(--text-tertiary)'}
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ transition: 'stroke 200ms ease' }}
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="12" y1="18" x2="12" y2="12" />
                    <polyline points="9 15 12 12 15 15" />
                  </svg>
                </motion.div>
                <div style={{ textAlign: 'center' }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      color: isDragging ? 'var(--accent)' : 'var(--text-secondary)',
                      transition: 'color 200ms ease',
                    }}
                  >
                    {isDragging ? 'Drop to upload' : 'Drop your slides here or click to browse'}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-tertiary)',
                      marginTop: 'var(--space-1)',
                    }}
                  >
                    PDF only · 50 MB max
                  </p>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="uploaded"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--space-4) var(--space-5)',
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--accent-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--accent)',
                    fontSize: 'var(--text-lg)',
                    flexShrink: 0,
                  }}
                >
                  ✓
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 'var(--text-base)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {file.name}
                  </p>
                  <p
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-tertiary)',
                      marginTop: 2,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatBytes(file.size)}
                    {pageCount > 0 && <> · {pageCount} {pageCount === 1 ? 'page' : 'pages'}</>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 'var(--text-xs)',
                    fontWeight: 500,
                    color: 'var(--text-tertiary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 'var(--space-1) var(--space-2)',
                    borderRadius: 'var(--radius-sm)',
                    transition: 'color 150ms ease, background 150ms ease',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--accent)';
                    e.currentTarget.style.background = 'var(--accent-muted)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--text-tertiary)';
                    e.currentTarget.style.background = 'none';
                  }}
                >
                  Remove
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {fileError && (
            <p
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--accent)',
                marginTop: 'var(--space-2)',
              }}
            >
              {fileError}
            </p>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />
        </motion.div>

        {/* Expectations form */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--text-xl)',
              color: 'var(--text-primary)',
              marginBottom: 'var(--space-4)',
            }}
          >
            Expectations
          </h2>
          <ExpectationsForm
            onSubmit={handleExpectationsSubmit}
            onValidityChange={setFormValid}
          />
        </motion.div>

        {/* Submit */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.4 }}
          style={{ paddingTop: 'var(--space-2)' }}
        >
          <motion.button
            type="submit"
            form="expectations-form"
            disabled={!canSubmit}
            whileHover={canSubmit ? { scale: 1.02 } : {}}
            whileTap={canSubmit ? { scale: 0.98 } : {}}
            style={{
              width: '100%',
              fontFamily: 'var(--font-body)',
              fontSize: 'var(--text-lg)',
              fontWeight: 500,
              color: canSubmit ? 'var(--text-on-dark)' : 'var(--text-tertiary)',
              background: canSubmit ? 'var(--accent)' : 'var(--bg-recessed)',
              border: canSubmit ? 'none' : '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: 'var(--space-4)',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              transition: 'background 200ms ease, color 200ms ease, border-color 200ms ease',
            }}
            onMouseEnter={(e) => {
              if (canSubmit) e.currentTarget.style.background = 'var(--accent-hover)';
            }}
            onMouseLeave={(e) => {
              if (canSubmit) e.currentTarget.style.background = 'var(--accent)';
            }}
          >
            Start Presenting &rarr;
          </motion.button>
        </motion.div>
      </div>
    </motion.div>
  );
}
