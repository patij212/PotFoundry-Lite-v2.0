import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TouchModeProvider, useTouchMode } from './TouchModeContext';

function Probe() {
  const touch = useTouchMode();
  return <div data-testid="probe">{String(touch)}</div>;
}

describe('useTouchMode', () => {
  it('defaults to false when called outside a provider', () => {
    render(<Probe />);
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });

  it('provider with value=true propagates true to consumers', () => {
    render(
      <TouchModeProvider value={true}>
        <Probe />
      </TouchModeProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('true');
  });

  it('provider with value=false propagates false to consumers', () => {
    render(
      <TouchModeProvider value={false}>
        <Probe />
      </TouchModeProvider>,
    );
    expect(screen.getByTestId('probe').textContent).toBe('false');
  });
});
