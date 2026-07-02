import React from 'react';
import { useAppStore } from '../../../state';
import './StatusLine.css';

export const StatusLine: React.FC = () => {
  const triangleCount = useAppStore((s) => s.performance.triangleCount);
  const generationTime = useAppStore((s) => s.performance.generationTime);
  const isGenerating = useAppStore((s) => s.performance.isGenerating);

  const text = isGenerating
    ? 'shaping…'
    : `${triangleCount.toLocaleString('en-US')} triangles · ${Math.round(generationTime)} ms`;

  return (
    <div className="pf3-status pf3-mono" data-testid="pf3-status" aria-live="polite">
      {text}
    </div>
  );
};
