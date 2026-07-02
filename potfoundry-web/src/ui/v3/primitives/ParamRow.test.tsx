import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ParamRow } from './ParamRow';

const setup = (over: Partial<Parameters<typeof ParamRow>[0]> = {}) => {
  const onChange = vi.fn();
  const onInteractionStart = vi.fn();
  const onValueCommit = vi.fn();
  render(
    <ParamRow
      label="Height" value={120} min={20} max={500} step={1} unit="mm"
      defaultValue={120} onChange={onChange}
      onInteractionStart={onInteractionStart} onValueCommit={onValueCommit}
      data-testid="row-h" {...over}
    />,
  );
  return { onChange, onInteractionStart, onValueCommit };
};

describe('ParamRow', () => {
  it('renders label, mono value and unit', () => {
    setup();
    expect(screen.getByText('Height')).toBeInTheDocument();
    expect(screen.getByTestId('row-h-value').textContent).toBe('120 mm');
  });

  it('slider change clamps, snaps and commits', () => {
    const { onChange, onInteractionStart, onValueCommit } = setup();
    const slider = screen.getByRole('slider');
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '652' } });
    expect(onInteractionStart).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith(500); // clamped to max
    fireEvent.pointerUp(slider);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('click value → type → Enter commits the typed number', () => {
    const { onChange, onValueCommit } = setup();
    fireEvent.click(screen.getByTestId('row-h-value'));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '200' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(200);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('Escape cancels editing without change', () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByTestId('row-h-value'));
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByTestId('row-h-value')).toBeInTheDocument();
  });

  it('double-click resets to defaultValue', () => {
    const { onChange, onValueCommit } = setup({ value: 300 });
    fireEvent.doubleClick(screen.getByTestId('row-h-value'));
    expect(onChange).toHaveBeenCalledWith(120);
    expect(onValueCommit).toHaveBeenCalledOnce();
  });

  it('arrow keys nudge ±step, Shift ×10', () => {
    const { onChange } = setup();
    const chip = screen.getByTestId('row-h-value');
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(121);
    fireEvent.keyDown(chip, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(110);
  });
});
