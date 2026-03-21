import { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

interface SlideViewerProps {
  file: File | string | null;
  pageNumber: number;
  width?: number;
}

export default function SlideViewer({ file, pageNumber, width }: SlideViewerProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  if (!file) {
    return (
      <div
        style={{
          width: width || '100%',
          aspectRatio: '16 / 9',
          background: 'var(--bg-recessed)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          padding: 'var(--space-6)',
          textAlign: 'center',
        }}
      >
        Slide preview unavailable — upload not in memory.
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          width: width || '100%',
          aspectRatio: '16 / 9',
          background: 'var(--bg-recessed)',
          borderRadius: 'var(--radius-lg)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--cat-timing)',
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
        }}
      >
        Unable to render PDF — file may be corrupted.
      </div>
    );
  }

  return (
    <div
      style={{
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-lg)',
        background: 'var(--bg-elevated)',
        position: 'relative',
      }}
    >
      {loading && (
        <div
          className="loading-shimmer"
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 1,
          }}
        />
      )}
      <Document
        file={file}
        onLoadError={() => setError(true)}
        loading={null}
      >
        <Page
          pageNumber={pageNumber}
          width={width}
          onRenderSuccess={() => setLoading(false)}
          renderTextLayer={false}
          renderAnnotationLayer={false}
        />
      </Document>
    </div>
  );
}
