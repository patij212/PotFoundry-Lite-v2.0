import React from 'react';

const base = {
  width: 16, height: 16, viewBox: '0 0 16 16',
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.5,
  strokeLinecap: 'round', strokeLinejoin: 'round',
} as const;

export const IconUndo: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M6 3 3 6l3 3" /><path d="M3 6h7a3 3 0 0 1 0 6H8" /></svg>
);
export const IconRedo: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M10 3l3 3-3 3" /><path d="M13 6H6a3 3 0 0 0 0 6h2" /></svg>
);
export const IconCameraReset: React.FC = () => (
  <svg {...base} aria-hidden="true"><circle cx="8" cy="8" r="2" /><path d="M8 2v2M8 12v2M2 8h2M12 8h2" /></svg>
);
export const IconRotate: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.5-3.5" /><path d="M13 2v3h-3" /></svg>
);
export const IconZen: React.FC = () => (
  <svg {...base} aria-hidden="true"><circle cx="8" cy="8" r="5.5" /><path d="M8 5.5v5M5.5 8h5" opacity="0.4" /></svg>
);
export const IconFullscreen: React.FC = () => (
  <svg {...base} aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" /></svg>
);
export const IconOrtho: React.FC = () => (
  <svg {...base} aria-hidden="true"><rect x="3" y="4" width="10" height="8" /><path d="M5 9h6" /></svg>
);
export const IconGrid: React.FC = () => (
  <svg {...base} aria-hidden="true"><line x1="3" y1="5" x2="13" y2="5" /><line x1="3" y1="8" x2="13" y2="8" /><line x1="3" y1="11" x2="13" y2="11" /><line x1="6" y1="2" x2="6" y2="14" /><line x1="10" y1="2" x2="10" y2="14" /></svg>
);
