interface SlideCarouselProps {
  totalSlides: number;
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export default function SlideCarousel({ totalSlides, selectedIndex, onSelect }: SlideCarouselProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        overflowX: 'auto',
        padding: 'var(--space-3) var(--space-4)',
        background: 'var(--bg-elevated)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <span
        className="category-label"
        style={{
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
          marginRight: 'var(--space-2)',
        }}
      >
        Slides
      </span>
      {Array.from({ length: totalSlides }, (_, i) => {
        const isSelected = i === selectedIndex;
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 'var(--text-sm)',
              fontVariantNumeric: 'tabular-nums',
              minWidth: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-md)',
              border: isSelected ? 'none' : '1px solid var(--border-subtle)',
              background: isSelected ? 'var(--accent)' : 'var(--bg-elevated)',
              color: isSelected ? 'var(--text-on-dark)' : 'var(--text-primary)',
              cursor: 'pointer',
              transition: 'background 120ms ease, color 120ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'var(--accent-muted)';
            }}
            onMouseLeave={(e) => {
              if (!isSelected) e.currentTarget.style.background = 'var(--bg-elevated)';
            }}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}
