import { describe, it, expect } from 'vitest';
import { resolvePreviewMode, PREVIEW_MODE_STORAGE_KEY } from './previewMode';

const none = () => null;

describe('resolvePreviewMode', () => {
  it('defaults to mesh', () => {
    expect(resolvePreviewMode('', none)).toBe('mesh');
  });
  it('URL param raycast wins', () => {
    expect(resolvePreviewMode('?preview=raycast', none)).toBe('raycast');
  });
  it('URL param mesh overrides storage', () => {
    expect(resolvePreviewMode('?preview=mesh', () => 'raycast')).toBe('mesh');
  });
  it('storage raycast applies when no URL param', () => {
    expect(resolvePreviewMode('?other=1', (k) => (k === PREVIEW_MODE_STORAGE_KEY ? 'raycast' : null))).toBe('raycast');
  });
  it('unknown values fall back to mesh', () => {
    expect(resolvePreviewMode('?preview=banana', () => 'garbage')).toBe('mesh');
  });
  it('storage getter throwing falls back to mesh', () => {
    expect(resolvePreviewMode('', () => { throw new Error('denied'); })).toBe('mesh');
  });
});
