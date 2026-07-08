import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PreviewModeSelect } from './PreviewModeSelect';
import { PREVIEW_MODE_STORAGE_KEY } from '../../renderers/webgpu/raycast/previewMode';

// The component reads the ACTIVE renderer (not the preference) to decide whether
// the ray-cast option is selectable. Mock the controller context with a mutable
// renderer type; null context = modal rendered before/without a mounted renderer.
let mockRendererType: 'webgpu' | 'webgl' | undefined;
vi.mock('../../context/ControllerContext', () => ({
  useControllerMaybe: () =>
    mockRendererType ? { rendererType: mockRendererType } : null,
}));

const getSelect = () => screen.getByLabelText(/preview engine/i) as HTMLSelectElement;
const getRaycastOption = () =>
  screen.getByRole('option', { name: /exact ray-cast/i }) as HTMLOptionElement;

describe('PreviewModeSelect', () => {
  beforeEach(() => {
    localStorage.clear();
    mockRendererType = undefined;
  });

  it('defaults to mesh', () => {
    render(<PreviewModeSelect />);
    expect(getSelect().value).toBe('mesh');
  });

  it('persists selection to localStorage', () => {
    render(<PreviewModeSelect />);
    fireEvent.change(getSelect(), { target: { value: 'raycast' } });
    expect(localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)).toBe('raycast');
  });

  it('reflects an existing stored value', () => {
    localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, 'raycast');
    render(<PreviewModeSelect />);
    expect(getSelect().value).toBe('raycast');
  });

  it('disables the raycast option with a note when the active renderer is WebGL', () => {
    mockRendererType = 'webgl';
    render(<PreviewModeSelect />);
    expect(getRaycastOption().disabled).toBe(true);
    expect(screen.getByText(/requires WebGPU/i)).toBeTruthy();
  });

  it('keeps the raycast option enabled on WebGPU with no unavailability note', () => {
    mockRendererType = 'webgpu';
    render(<PreviewModeSelect />);
    expect(getRaycastOption().disabled).toBe(false);
    expect(screen.queryByText(/requires WebGPU/i)).toBeNull();
  });

  it('fails open while the renderer is not yet known (no controller context)', () => {
    mockRendererType = undefined;
    render(<PreviewModeSelect />);
    expect(getRaycastOption().disabled).toBe(false);
    expect(screen.queryByText(/requires WebGPU/i)).toBeNull();
  });

  it('preserves a stored raycast preference on WebGL (shows note, does not rewrite storage)', () => {
    localStorage.setItem(PREVIEW_MODE_STORAGE_KEY, 'raycast');
    mockRendererType = 'webgl';
    render(<PreviewModeSelect />);
    expect(getSelect().value).toBe('raycast');
    expect(localStorage.getItem(PREVIEW_MODE_STORAGE_KEY)).toBe('raycast');
    expect(screen.getByText(/standard mesh preview is used/i)).toBeTruthy();
  });
});
