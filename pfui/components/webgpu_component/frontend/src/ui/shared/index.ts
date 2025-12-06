/**
 * Shared UI components module.
 * 
 * Exports all base UI components used throughout the application.
 * 
 * @module ui/shared
 */

export { Button, IconButton, type ButtonProps, type IconButtonProps, type ButtonVariant, type ButtonSize } from './Button';
export { Slider, type SliderProps } from './Slider';
export { Select, type SelectProps, type SelectOption } from './Select';
export { Section, SectionDivider, SectionGroup, type SectionProps, type SectionGroupProps } from './Section';
export { HelpDialog, InfoTooltip } from './HelpDialog';
export { ErrorBoundary, InlineErrorBoundary, withErrorBoundary } from './ErrorBoundary';
