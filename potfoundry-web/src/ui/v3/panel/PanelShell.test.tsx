import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PanelShell } from './PanelShell';
import { useAppStore } from '../../../state';

describe('PanelShell', () => {
  beforeEach(() => {
    localStorage.clear();
    useAppStore.getState().setV3ActiveTab('shape');
  });

  it('renders wordmark, tabs and content', () => {
    render(<PanelShell footer={<div>FOOT</div>}><p>CONTENT</p></PanelShell>);
    expect(screen.getByText('PotFoundry')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Shape' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('CONTENT')).toBeInTheDocument();
    expect(screen.getByText('FOOT')).toBeInTheDocument();
  });

  it('tab click updates the store', () => {
    render(<PanelShell><p /></PanelShell>);
    fireEvent.click(screen.getByRole('tab', { name: 'Export' }));
    expect(useAppStore.getState().ui.v3ActiveTab).toBe('export');
  });

  it('restores persisted width', () => {
    localStorage.setItem('pf3-panel-width', '420');
    render(<PanelShell><p /></PanelShell>);
    expect(screen.getByTestId('pf3-panel').style.width).toBe('420px');
  });
});
