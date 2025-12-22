import React from 'react';
import { Outlet } from 'react-router-dom';

export default function PrivateLayout() {
  return (
    <div style={styles.root}>
      <div style={styles.bg} />
      <div style={styles.overlay} />
      <div style={styles.content}>
        <Outlet />
      </div>
    </div>
  );
}

const styles = {
  root: {
    minHeight: '100svh',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#05060a',
  },
  bg: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 20% 20%, rgba(0, 230, 255, 0.15), transparent 45%),' +
      'radial-gradient(circle at 80% 15%, rgba(255, 200, 90, 0.12), transparent 50%),' +
      'radial-gradient(circle at 50% 85%, rgba(120, 60, 255, 0.18), transparent 55%)',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    transform: 'scale(1.03)',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    background:
      'radial-gradient(circle at 30% 25%, rgba(0, 200, 255, 0.18), transparent 55%),' +
      'radial-gradient(circle at 85% 70%, rgba(255, 200, 90, 0.14), transparent 50%),' +
      'linear-gradient(rgba(5, 6, 10, 0.65), rgba(5, 6, 10, 0.35))',
    backdropFilter: 'blur(2px)',
  },
  content: {
    position: 'relative',
    minHeight: '100svh',
    padding: '24px',
    display: 'flex',
    alignItems: 'stretch',
    justifyContent: 'center',
  },
};
