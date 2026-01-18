/**
 * Select Component Tests
 * Tests for the Select dropdown component.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Select } from './Select';

const TEST_OPTIONS = [
    { value: 'apple', label: 'Apple' },
    { value: 'banana', label: 'Banana' },
    { value: 'cherry', label: 'Cherry', description: 'Sweet and red' },
    { value: 'disabled', label: 'Disabled Option', disabled: true },
];

describe('Select', () => {
    it('should render with label', () => {
        render(
            <Select
                label="Fruit"
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
            />
        );
        expect(screen.getByText('Fruit')).toBeInTheDocument();
    });

    it('should display selected option label', () => {
        render(
            <Select
                value="banana"
                onChange={() => { }}
                options={TEST_OPTIONS}
            />
        );
        expect(screen.getByText('Banana')).toBeInTheDocument();
    });

    it('should display placeholder when no value', () => {
        render(
            <Select
                value=""
                onChange={() => { }}
                options={TEST_OPTIONS}
                placeholder="Choose fruit..."
            />
        );
        expect(screen.getByText('Choose fruit...')).toBeInTheDocument();
    });

    it('should render trigger button', () => {
        render(
            <Select
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
            />
        );
        expect(screen.getByRole('combobox')).toBeInTheDocument();
    });

    it('should be disabled when disabled prop is true', () => {
        render(
            <Select
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
                disabled
            />
        );
        expect(screen.getByRole('combobox')).toHaveAttribute('data-disabled', '');
    });

    it('should apply full-width class by default', () => {
        const { container } = render(
            <Select
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
            />
        );
        expect(container.querySelector('.pf-select--full-width')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(
            <Select
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
                className="custom-select"
            />
        );
        expect(container.querySelector('.custom-select')).toBeInTheDocument();
    });

    it('should have aria-label matching label', () => {
        render(
            <Select
                label="Pick Fruit"
                value="apple"
                onChange={() => { }}
                options={TEST_OPTIONS}
            />
        );
        expect(screen.getByRole('combobox')).toHaveAttribute('aria-label', 'Pick Fruit');
    });
});
