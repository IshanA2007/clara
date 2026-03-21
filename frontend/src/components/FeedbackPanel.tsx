import type { FeedbackItem, FeedbackCategory } from '../types';

interface FeedbackPanelProps {
  feedback: FeedbackItem[];
}

const categoryColors: Record<FeedbackCategory, string> = {
  pacing: 'var(--cat-pacing)',
  repetition: 'var(--cat-repetition)',
  clarity: 'var(--cat-clarity)',
  diction: 'var(--cat-diction)',
  structure: 'var(--cat-structure)',
  timing: 'var(--cat-timing)',
};

export default function FeedbackPanel({ feedback }: FeedbackPanelProps) {
  if (feedback.length === 0) {
    return (
      <p style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 'var(--text-sm)' }}>
        No feedback generated for this slide.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      {feedback.map((item, i) => {
        const isSuggestion = item.severity === 'suggestion';
        return (
          <div
            key={i}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--space-3)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-base)',
              borderLeft: isSuggestion ? '3px solid var(--accent)' : '3px solid transparent',
            }}
          >
            <span
              className="category-label"
              style={{
                display: 'inline-block',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: categoryColors[item.category],
                color: '#fff',
                whiteSpace: 'nowrap',
                lineHeight: 1.6,
                flexShrink: 0,
              }}
            >
              {item.category}
            </span>
            <span
              style={{
                fontSize: 'var(--text-sm)',
                color: 'var(--text-primary)',
                fontWeight: isSuggestion ? 600 : 400,
                lineHeight: 1.5,
              }}
            >
              {item.comment}
            </span>
          </div>
        );
      })}
    </div>
  );
}
