import React from 'react';

export default function GlassCard({ children, style }) {
  return (
    <div
      style={{
        width: 'min(1100px, 100%)',
        borderRadius: '24px',
        border: '1px solid rgba(255,255,255,0.12)',
        background: 'rgba(10, 12, 18, 0.50)',
        boxShadow: '0 18px 60px rgba(0,0,0,0.50)',
        backdropFilter: 'blur(10px)',
        padding: '22px',
        ...style,
      }}
    >
      {children}
    </div>
  );
}
