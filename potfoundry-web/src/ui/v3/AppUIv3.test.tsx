import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AppUIv3 from './AppUIv3';
import { useAppStore } from '../../state';

describe('AppUIv3 shell', () => {
  it('renders the pf3 root with dark theme', () => {
    render(<AppUIv3 />);
    const root = screen.getByTestId('pf3-root');
    expect(root).toHaveAttribute('data-theme', 'dark');
    expect(root.className).toContain('pf3-root');
  });

  it('store accepts the v3 theme', () => {
    useAppStore.getState().setUITheme('v3');
    expect(useAppStore.getState().ui.uiTheme).toBe('v3');
  });

  it('store tracks the v3 active tab', () => {
    useAppStore.getState().setV3ActiveTab('export');
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });
});
