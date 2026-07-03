/**
 * ShortcutsDialogV3 — pf3-styled keyboard shortcuts dialog.
 *
 * Ports the v2 pattern (Radix Dialog) with v3 design tokens (GlassSurface look,
 * display-font title, mono key chips, reduced-motion respected).
 *
 * @module ui/v3/shared/ShortcutsDialogV3
 */

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import './ShortcutsDialogV3.css';

// ============================================================================
// Constants
// ============================================================================

const V3_SHORTCUTS = [
  { keys: 'Z', description: 'Zen' },
  { keys: 'D', description: 'Export STL' },
  { keys: 'R', description: 'Reset camera' },
  { keys: 'Alt + 1', description: 'Shape tab' },
  { keys: 'Alt + 2', description: 'Style tab' },
  { keys: 'Alt + 3', description: 'Export tab' },
  { keys: 'Ctrl/⌘ + Z', description: 'Undo' },
  { keys: 'Ctrl/⌘ + Shift + Z / Ctrl/⌘ + Y', description: 'Redo' },
  { keys: '?', description: 'Shortcuts' },
  { keys: 'F11', description: 'Fullscreen' },
  { keys: 'Drag value', description: 'Scrub' },
  { keys: 'Double-click value', description: 'Reset' },
] as const;

// ============================================================================
// Types
// ============================================================================

interface ShortcutsDialogV3Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export function ShortcutsDialogV3({ open, onOpenChange }: ShortcutsDialogV3Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pf3-shortcuts-overlay" />
        <Dialog.Content className="pf3-shortcuts-content" aria-describedby={undefined}>
          <div className="pf3-shortcuts-header">
            <Dialog.Title className="pf3-shortcuts-title">Shortcuts</Dialog.Title>
            <Dialog.Close asChild>
              <button className="pf3-shortcuts-close" aria-label="Close shortcuts">
                <X size={16} />
              </button>
            </Dialog.Close>
          </div>

          <div className="pf3-shortcuts-list">
            {V3_SHORTCUTS.map((shortcut) => (
              <div key={shortcut.keys} className="pf3-shortcuts-item">
                <kbd className="pf3-shortcuts-key">{shortcut.keys}</kbd>
                <span className="pf3-shortcuts-desc">{shortcut.description}</span>
              </div>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
