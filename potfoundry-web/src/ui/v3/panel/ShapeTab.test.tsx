import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ShapeTab } from './ShapeTab';
import { useAppStore } from '../../../state';
import { DEFAULT_GEOMETRY } from '../../../state/types';

describe('ShapeTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.setState(() => ({ geometry: { ...DEFAULT_GEOMETRY } }));
  });

  it('shows the three essential Size rows, hides advanced by default', () => {
    render(<ShapeTab />);
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByText('Top diameter')).toBeInTheDocument();
    expect(screen.getByText('Bottom diameter')).toBeInTheDocument();
    expect(screen.queryByText('Wall thickness')).not.toBeInTheDocument();
  });

  it('advanced seam reveals walls/drain/flare rows', () => {
    render(<ShapeTab />);
    fireEvent.click(screen.getByRole('button', { name: /advanced — walls, drain & flare/ }));
    expect(screen.getByText('Wall thickness')).toBeInTheDocument();
    expect(screen.getByText('Flare')).toBeInTheDocument();
  });

  it('slider edit writes to the store', () => {
    render(<ShapeTab />);
    const slider = screen.getByTestId('pf3-param-H').querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '200' } });
    fireEvent.pointerUp(slider);
    expect(useAppStore.getState().geometry.H).toBe(200);
  });

  it('renders BlueprintCanvas before the Size section', () => {
    render(<ShapeTab />);
    const blueprint = screen.getByTestId('pf3-blueprint');
    const sizeHeading = screen.getByText('Size');
    expect(blueprint).toBeInTheDocument();
    // Blueprint appears before Size in DOM order
    expect(blueprint.compareDocumentPosition(sizeHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
