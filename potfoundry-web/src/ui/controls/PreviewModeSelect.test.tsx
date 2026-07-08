import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewModeSelect } from './PreviewModeSelect';
import { PREVIEW_MODE_STORAGE_KEY } from '../../renderers/webgpu/raycast/previewMode';

describe('PreviewModeSelect', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to mesh', () => {
    render(<PreviewModeSelect />);
    expect((screen.getByLabelText(/preview engine/i) as HTMLSelectElement).value).toBe('mesh');
  });

  it('persists selection to localStorage', () => {
    render(<PreviewModeSelect />);
    fireEvent.change(screen.getByLabelText(/preview engine/i), { target: { value: 'raycast' } });
    expect(localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)).toBe('raycast');
  });

  it('reflects an existing stored value', () => {
    localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, 'raycast');
    render(<PreviewModeSelect />);
    expect((screen.getByLabelText(/preview engine/i) as HTMLSelectElement).value).toBe('raycast');
  });
});
