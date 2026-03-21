import { useMemo } from 'react';
import type { FillerInstance } from '../types';

interface TranscriptPanelProps {
  transcript: string;
  fillerWords: FillerInstance[];
  expanded?: boolean;
  onToggle: () => void;
}

const PREVIEW_LENGTH = 100;

interface TextSegment {
  text: string;
  isFiller: boolean;
}

function buildHighlightedSegments(transcript: string, fillerWords: FillerInstance[]): TextSegment[] {
  if (fillerWords.length === 0) return [{ text: transcript, isFiller: false }];

  const fillerSet = new Set(fillerWords.map((f) => f.word.toLowerCase()));
  const pattern = [...fillerSet].map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const regex = new RegExp(`\\b(${pattern})\\b`, 'gi');

  const segments: TextSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(transcript)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: transcript.slice(lastIndex, match.index), isFiller: false });
    }
    segments.push({ text: match[0], isFiller: true });
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < transcript.length) {
    segments.push({ text: transcript.slice(lastIndex), isFiller: false });
  }

  return segments;
}

export default function TranscriptPanel({ transcript, fillerWords, expanded = false, onToggle }: TranscriptPanelProps) {
  const segments = useMemo(
    () => buildHighlightedSegments(transcript, fillerWords),
    [transcript, fillerWords],
  );

  const isLong = transcript.length > PREVIEW_LENGTH;
  const showToggle = isLong;

  return (
    <div>
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 'var(--text-sm)',
          color: 'var(--text-primary)',
          lineHeight: 1.7,
        }}
      >
        {expanded ? (
          segments.map((seg, i) =>
            seg.isFiller ? (
              <mark
                key={i}
                style={{
                  background: 'var(--accent-muted)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '1px 3px',
                  color: 'inherit',
                }}
              >
                {seg.text}
              </mark>
            ) : (
              <span key={i}>{seg.text}</span>
            ),
          )
        ) : (
          <span>
            {transcript.slice(0, PREVIEW_LENGTH)}
            {isLong && '…'}
          </span>
        )}
      </div>

      {showToggle && (
        <button
          onClick={onToggle}
          style={{
            marginTop: 'var(--space-2)',
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontFamily: 'var(--font-body)',
            fontSize: 'var(--text-sm)',
            fontWeight: 500,
            cursor: 'pointer',
            padding: 0,
          }}
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
