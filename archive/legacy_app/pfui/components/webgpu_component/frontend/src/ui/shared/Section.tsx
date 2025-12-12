/**
 * Collapsible section component wrapping Radix UI Collapsible.
 * 
 * Provides an expandable/collapsible section with header and content.
 * 
 * @module ui/shared/Section
 */

import React from 'react';
import * as Collapsible from '@radix-ui/react-collapsible';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import './Section.css';

// ============================================================================
// Types
// ============================================================================

export interface SectionProps {
  /** Section title */
  title: string;
  /** Optional icon to show before title */
  icon?: React.ReactNode;
  /** Whether the section starts expanded */
  defaultOpen?: boolean;
  /** Controlled open state */
  open?: boolean;
  /** Callback when open state changes */
  onOpenChange?: (open: boolean) => void;
  /** Section content */
  children: React.ReactNode;
  /** Additional CSS class */
  className?: string;
  /** Whether to show the collapse indicator */
  collapsible?: boolean;
}

// ============================================================================
// Component
// ============================================================================

/**
 * A collapsible section with header and content area.
 * 
 * @example
 * ```tsx
 * <Section title="Dimensions" icon={<RulerIcon />} defaultOpen>
 *   <Slider label="Height" ... />
 *   <Slider label="Width" ... />
 * </Section>
 * ```
 */
export const Section: React.FC<SectionProps> = ({
  title,
  icon,
  defaultOpen = true,
  open,
  onOpenChange,
  children,
  className,
  collapsible = true,
}) => {
  // If not collapsible, render simple static section
  if (!collapsible) {
    return (
      <div className={clsx('pf-section', 'pf-section--static', className)}>
        <div className="pf-section__header">
          {icon && <span className="pf-section__icon">{icon}</span>}
          <h3 className="pf-section__title">{title}</h3>
        </div>
        <div className="pf-section__content">{children}</div>
      </div>
    );
  }

  return (
    <Collapsible.Root
      className={clsx('pf-section', className)}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Collapsible.Trigger className="pf-section__trigger">
        <div className="pf-section__header">
          {icon && <span className="pf-section__icon">{icon}</span>}
          <h3 className="pf-section__title">{title}</h3>
        </div>
        <ChevronRight className="pf-section__chevron" size={16} />
      </Collapsible.Trigger>
      
      <Collapsible.Content className="pf-section__content-wrapper">
        <div className="pf-section__content">{children}</div>
      </Collapsible.Content>
    </Collapsible.Root>
  );
};

// ============================================================================
// Section Divider
// ============================================================================

export interface SectionDividerProps {
  className?: string;
}

/**
 * A horizontal divider between sections.
 */
export const SectionDivider: React.FC<SectionDividerProps> = ({ className }) => (
  <div className={clsx('pf-section-divider', className)} />
);

// ============================================================================
// Section Group
// ============================================================================

export interface SectionGroupProps {
  /** Group label */
  label?: string;
  /** Group content */
  children: React.ReactNode;
  /** Additional CSS class */
  className?: string;
}

/**
 * Groups related form elements with an optional label.
 */
export const SectionGroup: React.FC<SectionGroupProps> = ({
  label,
  children,
  className,
}) => (
  <div className={clsx('pf-section-group', className)}>
    {label && <span className="pf-section-group__label">{label}</span>}
    <div className="pf-section-group__content">{children}</div>
  </div>
);
