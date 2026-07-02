import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusLine } from './StatusLine';
import { useAppStore } from '../../../state';

describe('StatusLine', () => {
  it('formats triangles with separators and shows generation time', () => {
    useAppStore.setState((s) => ({
      performance: { ...s.performance, triangleCount: 24412, generationTime: 12.4, isGenerating: false },
    }));
    render(<StatusLine />);
    expect(screen.getByTestId('pf3-status').textContent).toBe('24,412 triangles · 12 ms');
  });

  it('announces shaping while generating', () => {
    useAppStore.setState((s) => ({
      performance: { ...s.performance, isGenerating: true },
    }));
    render(<StatusLine />);
    expect(screen.getByTestId('pf3-status').textContent).toContain('shaping…');
  });
});
