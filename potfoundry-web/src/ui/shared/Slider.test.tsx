/**
 * Slider Component Tests
 * Tests for the Slider component.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Slider } from './Slider';

describe('Slider', () => {
    it('should render with label', () => {
        render(
            <Slider label="Height" value={50} onChange={() => { }} min={0} max={100} />
        );
        expect(screen.getByText('Height')).toBeInTheDocument();
    });

    it('should display current value', () => {
        render(
            <Slider value={75} onChange={() => { }} min={0} max={100} showInput />
        );
        expect(screen.getByRole('spinbutton')).toHaveValue(75);
    });

    it('should display unit', () => {
        render(
            <Slider label="Size" value={50} onChange={() => { }} min={0} max={100} unit="mm" />
        );
        expect(screen.getByText('mm')).toBeInTheDocument();
    });

    it('should call onChange when input changes', () => {
        const handleChange = vi.fn();
        render(
            <Slider value={50} onChange={handleChange} min={0} max={100} showInput />
        );
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '75' } });
        expect(handleChange).toHaveBeenCalled();
    });

    it('should clamp value to max', () => {
        const handleChange = vi.fn();
        render(
            <Slider value={50} onChange={handleChange} min={0} max={100} showInput />
        );
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '150' } });
        expect(handleChange).toHaveBeenCalledWith(100);
    });

    it('should clamp value to min', () => {
        const handleChange = vi.fn();
        render(
            <Slider value={50} onChange={handleChange} min={10} max={100} showInput />
        );
        const input = screen.getByRole('spinbutton');
        fireEvent.change(input, { target: { value: '5' } });
        expect(handleChange).toHaveBeenCalledWith(10);
    });

    it('should show min and max bounds', () => {
        render(
            <Slider value={50} onChange={() => { }} min={0} max={100} />
        );
        expect(screen.getByText('0')).toBeInTheDocument();
        expect(screen.getByText('100')).toBeInTheDocument();
    });

    it('should apply disabled class when disabled', () => {
        const { container } = render(
            <Slider value={50} onChange={() => { }} min={0} max={100} disabled />
        );
        expect(container.querySelector('.pf-slider--disabled')).toBeInTheDocument();
    });

    it('should disable input when disabled', () => {
        render(
            <Slider value={50} onChange={() => { }} min={0} max={100} disabled showInput />
        );
        expect(screen.getByRole('spinbutton')).toBeDisabled();
    });

    it('should call onChangeEnd on blur', () => {
        const handleChangeEnd = vi.fn();
        render(
            <Slider
                value={50}
                onChange={() => { }}
                onChangeEnd={handleChangeEnd}
                min={0}
                max={100}
                showInput
            />
        );
        const input = screen.getByRole('spinbutton');
        fireEvent.blur(input);
        expect(handleChangeEnd).toHaveBeenCalledWith(50);
    });

    it('should format decimal values correctly', () => {
        render(
            <Slider value={3.14} onChange={() => { }} min={0} max={10} step={0.01} showInput />
        );
        expect(screen.getByRole('spinbutton')).toHaveValue(3.14);
    });

    it('should hide input when showInput is false', () => {
        render(
            <Slider value={50} onChange={() => { }} min={0} max={100} showInput={false} />
        );
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(
            <Slider value={50} onChange={() => { }} min={0} max={100} className="custom-slider" />
        );
        expect(container.querySelector('.custom-slider')).toBeInTheDocument();
    });
});
