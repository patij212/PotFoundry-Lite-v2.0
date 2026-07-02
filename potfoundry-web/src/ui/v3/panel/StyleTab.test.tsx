import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StyleTab } from './StyleTab';
import { useAppStore } from '../../../state';
import type { StyleName } from '../../../state/types';

// Spread the real registry and inject a fixture style that has a bool param +
// empty advancedParams.  All existing tests still run against real HarmonicRipple
// because it remains in the registry via the spread.
vi.mock('../../../styles/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../styles/registry')>();
  return {
    ...actual,
    STYLE_REGISTRY: {
      ...actual.STYLE_REGISTRY,
      MockBoolStyle: {
        id: 99,
        shaderName: 'mock_bool',
        name: 'Mock Bool Style',
        description: 'Fixture style for bool dispatch tests.',
        params: {
          test_toggle: { type: 'bool' as const, default: false, label: 'Test Toggle' },
        },
        advancedParams: {},
      },
    },
  };
});

describe('StyleTab', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setStyle('HarmonicRipple');
  });

  it('shows the current style card and its parameter rows', () => {
    render(<StyleTab />);
    // registry key still present via the secondary mono label (textContent aggregates descendants)
    expect(screen.getByTestId('pf3-style-current').textContent).toContain('HarmonicRipple');
    // HarmonicRipple has hr_petals etc. — at least one labelled row renders
    expect(screen.getAllByRole('slider').length).toBeGreaterThan(0);
  });

  // F1: heading shows display name; registry key appears as secondary mono label in card
  it('heading shows display name; registry key appears as mono label in the same card', () => {
    render(<StyleTab />);
    const card = screen.getByTestId('pf3-style-current');
    expect(card.textContent).toContain('Harmonic Ripple');
    expect(card.textContent).toContain('HarmonicRipple');
  });

  // F4: subline includes description and param count
  it('subline includes the description and a parameter count', () => {
    render(<StyleTab />);
    const card = screen.getByTestId('pf3-style-current');
    expect(card.textContent).toContain('parameters');
    expect(card.textContent).toContain('Petals + ripples');
  });

  it('changing style select writes to the store', () => {
    render(<StyleTab />);
    fireEvent.change(screen.getByLabelText('Style'), { target: { value: 'GothicArches' } });
    expect(useAppStore.getState().style.name).toBe('GothicArches');
  });

  it('param row edit writes a style opt', () => {
    render(<StyleTab />);
    const first = screen.getAllByRole('slider')[0];
    fireEvent.pointerDown(first);
    fireEvent.change(first, { target: { value: String(Number(first.getAttribute('max'))) } });
    fireEvent.pointerUp(first);
    const { opts } = useAppStore.getState().style;
    expect(Object.keys(opts).length).toBeGreaterThan(0);
  });

  // F2: bool param renders ToggleRow; click dispatches setStyleOpt(key, true)
  it('bool param renders a ToggleRow switch and setStyleOpt is called with true on click', () => {
    useAppStore.getState().setStyle('MockBoolStyle' as StyleName);
    render(<StyleTab />);
    const toggle = screen.getByRole('switch');
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);
    expect(useAppStore.getState().style.opts['test_toggle']).toBe(true);
  });

  // F3: advanced seam conditional
  describe('advanced seam', () => {
    it('renders for HarmonicRipple which has advancedParams', () => {
      render(<StyleTab />);
      // DisclosureSeam renders its summary inside a <button>; use accessible name query
      expect(
        screen.getByRole('button', { name: /advanced — \d+ more/ }),
      ).toBeInTheDocument();
    });

    it('does NOT render for a style with empty advancedParams', () => {
      useAppStore.getState().setStyle('MockBoolStyle' as StyleName);
      render(<StyleTab />);
      expect(
        screen.queryByRole('button', { name: /advanced — \d+ more/ }),
      ).not.toBeInTheDocument();
    });
  });
});
