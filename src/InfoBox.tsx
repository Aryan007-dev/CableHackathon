import React from 'react';

interface InfoBoxProps {
  id: string;
  children: React.ReactNode;
  onDismiss: (id: string) => void;
}

export function InfoBox({ id, children, onDismiss }: InfoBoxProps) {
  return (
    <div
      style={{
        position: 'absolute',
        top: '100%',
        left: 0,
        marginTop: '8px',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--color-surface)',
          border: '2px solid var(--color-accent)',
          borderRadius: '8px',
          padding: '12px',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: '500px',
          fontSize: '14px',
          color: 'var(--color-ink)',
          
          lineHeight: '1.5',
        }}
      >
        {children}
        <button
          onClick={() => onDismiss(id)}
          style={{
            marginTop: '12px',
            padding: '8px 16px',
            background: 'var(--color-accent)',
            color: 'var(--color-accent-contrast)',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '13px',
            fontWeight: '500',
            width: '100%',
            transition: 'background 0.2s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-accent-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--color-accent)';
          }}
        >
          Got it
        </button>
      </div>
    </div>
  );
}
