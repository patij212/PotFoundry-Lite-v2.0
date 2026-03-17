/**
 * ShortcutsDialog — v2-styled keyboard shortcuts dialog.
 *
 * Replaces the v1 HelpDialog with a Radix Dialog using v2 design tokens.
 * Drop-in replacement: same { open, onOpenChange } interface.
 *
 * @module ui/v2/shared/ShortcutsDialog
 */

import * as Dialog from '@radix-ui/react-dialog';
import { Keyboard, X } from 'lucide-react';
import './ShortcutsDialog.css';

// ============================================================================
// Constants
// ============================================================================

const V2_SHORTCUTS = [
  { keys: 'Ctrl/⌘ + Z', description: 'Undo' },
  { keys: 'Ctrl/⌘ + Shift + Z', description: 'Redo' },
  { keys: 'D', description: 'Download / export' },
  { keys: 'R', description: 'Reset camera' },
  { keys: 'Z', description: 'Toggle zen mode' },
  { keys: 'Alt + 1', description: 'Shape tab' },
  { keys: 'Alt + 2', description: 'Style tab' },
  { keys: 'Alt + 3', description: 'Export tab' },
  { keys: '?', description: 'Keyboard shortcuts' },
  { keys: 'Shift + ←/→', description: 'Coarse slider step (×10)' },
  { keys: 'Double-click slider', description: 'Reset to default' },
  { keys: 'F11', description: 'Toggle fullscreen' },
] as const;

// ============================================================================
// Types
// ============================================================================

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf2-shortcuts-overlay" />
        <Dialog.Content className="pf2-shortcuts-content" aria-describedby={undefined}>
          <div className="pf2-shortcuts-header">
            <Dialog.Title className="pf2-shortcuts-title">
              <Keyboard size={18} />
              Keyboard Shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="pf2-shortcuts-close" aria-label="Close">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="pf2-shortcuts-list">
            {V2_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="pf2-shortcuts-item">
                <kbd className="pf2-shortcuts-key">{shortcut.keys}</kbd>
                <span className="pf2-shortcuts-desc">{shortcut.description}</span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
