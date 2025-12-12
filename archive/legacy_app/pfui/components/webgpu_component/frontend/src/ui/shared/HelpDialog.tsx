/**
 * HelpDialog Component
 *
 * Modal dialog displaying keyboard shortcuts and help information.
 * Built with Radix UI Dialog for accessibility.
 *
 * @module ui/shared/HelpDialog
 */

import { X, Keyboard, Info, ExternalLink } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { SHORTCUTS, formatShortcut, getShortcutGroups } from '../../hooks/useKeyboardShortcuts';
import './HelpDialog.css';

interface HelpDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when dialog open state changes */
  onOpenChange: (open: boolean) => void;
}

/**
 * Keyboard shortcuts section
 */
function ShortcutsSection() {
  const groups = getShortcutGroups();

  return (
    <div className="help-section">
      <h3 className="help-section-title">
        <Keyboard size={16} />
        Keyboard Shortcuts
      </h3>

      {Array.from(groups.entries()).map(([groupName, shortcuts]) => (
        <div key={groupName} className="help-group">
          <h4 className="help-group-title">{groupName}</h4>
          <ul className="help-shortcuts-list">
            {shortcuts.map((shortcut) => (
              <li key={shortcut.action} className="help-shortcut-item">
                <kbd className="help-shortcut-key">{formatShortcut(shortcut)}</kbd>
                <span className="help-shortcut-desc">{shortcut.description}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/**
 * Tips section
 */
function TipsSection() {
  const tips = [
    'Use the scroll wheel to zoom in/out on the 3D preview',
    'Click and drag to rotate the pot in the preview',
    'Higher mesh resolution produces smoother exports but slower preview',
    'Pattern frequency controls the number of repeating elements',
    'Spiral twist adds a helix effect to the pattern',
    'The drain hole radius should be smaller than the bottom radius minus wall thickness',
  ];

  return (
    <div className="help-section">
      <h3 className="help-section-title">
        <Info size={16} />
        Tips
      </h3>
      <ul className="help-tips-list">
        {tips.map((tip, index) => (
          <li key={index} className="help-tip-item">
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * About section
 */
function AboutSection() {
  return (
    <div className="help-section">
      <h3 className="help-section-title">About PotFoundry</h3>
      <p className="help-about-text">
        PotFoundry is a parametric 3D pot generator that creates customizable,
        3D-printable plant pots with decorative patterns. Featuring five artistic
        styles with full parametric control.
      </p>
      <div className="help-links">
        <a
          href="https://github.com/potfoundry/potfoundry"
          target="_blank"
          rel="noopener noreferrer"
          className="help-link"
        >
          <ExternalLink size={14} />
          Documentation
        </a>
      </div>
    </div>
  );
}

/**
 * HelpDialog Component
 *
 * Displays keyboard shortcuts, tips, and about information
 * in an accessible modal dialog.
 */
export function HelpDialog({ open, onOpenChange }: HelpDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="help-dialog-overlay" />
        <Dialog.Content className="help-dialog-content">
          <Dialog.Title className="help-dialog-title">
            Help &amp; Shortcuts
          </Dialog.Title>
          <Dialog.Description className="help-dialog-description">
            Keyboard shortcuts and tips for using PotFoundry
          </Dialog.Description>

          <div className="help-dialog-body">
            <ShortcutsSection />
            <TipsSection />
            <AboutSection />
          </div>

          <Dialog.Close asChild>
            <button className="help-dialog-close" aria-label="Close">
              <X size={18} />
            </button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Small info tooltip component for inline help
 */
interface InfoTooltipProps {
  /** Tooltip content */
  content: string;
  /** Size of the info icon */
  size?: number;
}

export function InfoTooltip({ content, size = 14 }: InfoTooltipProps) {
  return (
    <span className="info-tooltip" title={content}>
      <Info size={size} />
    </span>
  );
}
