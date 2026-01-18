/**
 * Section Component Tests
 * Tests for the Section, SectionDivider, and SectionGroup components.
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Section, SectionDivider, SectionGroup } from './Section';

describe('Section', () => {
    it('should render title', () => {
        render(
            <Section title="Settings">
                <p>Content</p>
            </Section>
        );
        expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should render children', () => {
        render(
            <Section title="Panel">
                <p>Child content</p>
            </Section>
        );
        expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('should render icon when provided', () => {
        render(
            <Section title="With Icon" icon={<span data-testid="icon">⚙️</span>}>
                <p>Content</p>
            </Section>
        );
        expect(screen.getByTestId('icon')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(
            <Section title="Custom" className="my-section">
                <p>Content</p>
            </Section>
        );
        expect(container.querySelector('.my-section')).toBeInTheDocument();
    });

    it('should be collapsible by default', () => {
        const { container } = render(
            <Section title="Collapsible">
                <p>Content</p>
            </Section>
        );
        // Should have trigger button for collapsible
        expect(container.querySelector('.pf-section__trigger')).toBeInTheDocument();
    });

    it('should render static when collapsible is false', () => {
        const { container } = render(
            <Section title="Static" collapsible={false}>
                <p>Content</p>
            </Section>
        );
        expect(container.querySelector('.pf-section--static')).toBeInTheDocument();
    });

    it('should call onOpenChange callback', () => {
        const handleOpenChange = vi.fn();
        const { container } = render(
            <Section title="Callback" onOpenChange={handleOpenChange}>
                <p>Content</p>
            </Section>
        );
        const trigger = container.querySelector('.pf-section__trigger');
        if (trigger) {
            fireEvent.click(trigger);
            expect(handleOpenChange).toHaveBeenCalled();
        }
    });
});

describe('SectionDivider', () => {
    it('should render divider', () => {
        const { container } = render(<SectionDivider />);
        expect(container.querySelector('.pf-section-divider')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(<SectionDivider className="custom-divider" />);
        expect(container.querySelector('.custom-divider')).toBeInTheDocument();
    });
});

describe('SectionGroup', () => {
    it('should render children', () => {
        render(
            <SectionGroup>
                <p>Group content</p>
            </SectionGroup>
        );
        expect(screen.getByText('Group content')).toBeInTheDocument();
    });

    it('should render label when provided', () => {
        render(
            <SectionGroup label="Parameters">
                <p>Content</p>
            </SectionGroup>
        );
        expect(screen.getByText('Parameters')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
        const { container } = render(
            <SectionGroup className="custom-group">
                <p>Content</p>
            </SectionGroup>
        );
        expect(container.querySelector('.custom-group')).toBeInTheDocument();
    });

    it('should have pf-section-group class', () => {
        const { container } = render(
            <SectionGroup>
                <p>Content</p>
            </SectionGroup>
        );
        expect(container.querySelector('.pf-section-group')).toBeInTheDocument();
    });
});
