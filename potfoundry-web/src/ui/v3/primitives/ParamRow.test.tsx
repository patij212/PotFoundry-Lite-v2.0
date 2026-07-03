import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
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

/**
 * Open the text editor via single click + timer expiry.
 * Must be called with fake timers already active.
 */
const openEditor = () => {
  fireEvent.click(screen.getByTestId('row-h-value'));
  act(() => { vi.advanceTimersByTime(300); });
  return screen.getByRole('textbox');
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

  describe('chip edit flow (fake timers for F3 debounce)', () => {
    afterEach(() => vi.useRealTimers());

    it('single click + timer expiry → editor opens, no onChange', () => {
      vi.useFakeTimers();
      const { onChange } = setup();
      const input = openEditor();
      expect(input).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it('Enter commits exactly once — trailing blur is a no-op (F2)', () => {
      vi.useFakeTimers();
      const { onChange, onInteractionStart, onValueCommit } = setup();
      const input = openEditor();
      fireEvent.change(input, { target: { value: '200' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      // Real browsers fire blur when the input unmounts; the skipBlurRef guard must swallow it
      fireEvent.blur(input);
      expect(onChange).toHaveBeenCalledWith(200);
      expect(onValueCommit).toHaveBeenCalledOnce();
      expect(onInteractionStart).toHaveBeenCalledOnce();
    });

    it('Escape cancels editing — trailing blur is a no-op (F1)', () => {
      vi.useFakeTimers();
      const { onChange } = setup();
      const input = openEditor();
      fireEvent.change(input, { target: { value: '999' } });
      fireEvent.keyDown(input, { key: 'Escape' });
      // Real browsers fire blur on unmount; guard must swallow it without committing
      fireEvent.blur(input);
      expect(onChange).not.toHaveBeenCalled();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.getByTestId('row-h-value')).toBeInTheDocument();
    });

    it('two rapid clicks → reset to defaultValue, editor never opens (F3)', () => {
      vi.useFakeTimers();
      const { onChange, onInteractionStart, onValueCommit } = setup({ value: 300 });
      const chip = screen.getByTestId('row-h-value');
      fireEvent.click(chip);
      fireEvent.click(chip); // cancels the pending timer and resets
      // Advance past the (cancelled) timer to confirm the editor never opened
      act(() => { vi.advanceTimersByTime(300); });
      expect(onChange).toHaveBeenCalledWith(120);
      expect(onInteractionStart).toHaveBeenCalledOnce();
      expect(onValueCommit).toHaveBeenCalledOnce();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });

  it('arrow keys nudge ±step, Shift ×10', () => {
    const { onChange } = setup();
    const chip = screen.getByTestId('row-h-value');
    fireEvent.keyDown(chip, { key: 'ArrowUp' });
    expect(onChange).toHaveBeenCalledWith(121);
    fireEvent.keyDown(chip, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenCalledWith(110);
  });

  describe('chip scrub (pointer drag)', () => {
    afterEach(() => vi.useRealTimers());

    it('30px drag → onInteractionStart once, live onChange, onValueCommit once, no editor', () => {
      vi.useFakeTimers();
      const { onChange, onInteractionStart, onValueCommit } = setup();
      const chip = screen.getByTestId('row-h-value');
      fireEvent.pointerDown(chip, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(chip, { clientX: 10, pointerId: 1 }); // crosses 4px threshold
      fireEvent.pointerMove(chip, { clientX: 20, pointerId: 1 });
      fireEvent.pointerMove(chip, { clientX: 30, pointerId: 1 });
      fireEvent.pointerUp(chip, { pointerId: 1 });
      fireEvent.click(chip); // browser fires click after pointerup — must be suppressed
      act(() => { vi.advanceTimersByTime(300); });
      expect(onInteractionStart).toHaveBeenCalledOnce();
      // startValue=120, dx=30 → Math.round(30/3)*step*1 = 10 → 130
      expect(onChange).toHaveBeenLastCalledWith(130);
      expect(onValueCommit).toHaveBeenCalledOnce();
      expect(screen.queryByRole('textbox')).toBeNull();
    });

    it('move <4px then pointerup → click timer logic untouched (editor opens)', () => {
      vi.useFakeTimers();
      setup();
      const chip = screen.getByTestId('row-h-value');
      fireEvent.pointerDown(chip, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(chip, { clientX: 3, pointerId: 1 }); // below 4px threshold
      fireEvent.pointerUp(chip, { pointerId: 1 });
      fireEvent.click(chip); // no suppression — timer should arm
      act(() => { vi.advanceTimersByTime(300); });
      expect(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('Shift-scrub applies ×10 multiplier', () => {
      vi.useFakeTimers();
      const { onChange } = setup();
      const chip = screen.getByTestId('row-h-value');
      fireEvent.pointerDown(chip, { clientX: 0, pointerId: 1 });
      // dx=30, Shift → Math.round(30/3)*step*10 = 100 → 120+100 = 220
      fireEvent.pointerMove(chip, { clientX: 30, pointerId: 1, shiftKey: true });
      fireEvent.pointerUp(chip, { pointerId: 1 });
      expect(onChange).toHaveBeenLastCalledWith(220);
    });

    it('scrub clamps at max', () => {
      vi.useFakeTimers();
      const { onChange } = setup({ value: 490 });
      const chip = screen.getByTestId('row-h-value');
      fireEvent.pointerDown(chip, { clientX: 0, pointerId: 1 });
      // dx=60, step=1 → Math.round(60/3)*1 = 20 → 490+20=510, clamped to 500
      fireEvent.pointerMove(chip, { clientX: 60, pointerId: 1 });
      fireEvent.pointerUp(chip, { pointerId: 1 });
      expect(onChange).toHaveBeenLastCalledWith(500);
    });

    it('Escape mid-scrub → restores startValue, commits once, suppresses click', () => {
      vi.useFakeTimers();
      const { onChange, onInteractionStart, onValueCommit } = setup();
      const chip = screen.getByTestId('row-h-value');
      fireEvent.pointerDown(chip, { clientX: 0, pointerId: 1 });
      fireEvent.pointerMove(chip, { clientX: 20, pointerId: 1 }); // enters scrub
      fireEvent.keyDown(chip, { key: 'Escape' }); // restore startValue + commit
      fireEvent.pointerUp(chip, { pointerId: 1 }); // click should still be suppressed
      fireEvent.click(chip);
      act(() => { vi.advanceTimersByTime(300); });
      expect(onInteractionStart).toHaveBeenCalledOnce();
      expect(onChange).toHaveBeenLastCalledWith(120); // restored to startValue
      expect(onValueCommit).toHaveBeenCalledOnce();
      expect(screen.queryByRole('textbox')).toBeNull();
    });
  });
});
