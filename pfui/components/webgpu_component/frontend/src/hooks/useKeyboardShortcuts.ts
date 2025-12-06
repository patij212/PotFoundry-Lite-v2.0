/**
 * useKeyboardShortcuts Hook
 *
 * Provides global keyboard shortcuts for the PotFoundry application.
 * Implements standard shortcuts (Ctrl+S, Ctrl+R, etc.) and custom
 * application-specific bindings.
 *
 * @module hooks/useKeyboardShortcuts
 *
 * ## Keyboard Shortcuts
 *
 * | Shortcut       | Action                           |
 * |----------------|----------------------------------|
 * | Ctrl+S         | Export/Save STL                  |
 * | Ctrl+R         | Reset to defaults                |
 * | Ctrl+P         | Toggle control panel             |
 * | 1-5            | Select style (quick access)      |
 * | Space          | Toggle auto-rotate               |
 * | Escape         | Close any open dialog            |
 * | ?              | Show help/shortcuts              |
 * | Ctrl+Z         | Undo (if history available)      |
 * | Ctrl+Shift+Z   | Redo (if history available)      |
 *
 * ## Usage
 *
 * ```tsx
 * import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
 *
 * function App() {
 *   useKeyboardShortcuts({
 *     onExport: () => handleExport(),
 *     onReset: () => handleReset(),
 *     onTogglePanel: () => setShowPanel(prev => !prev),
 *     enabled: true,
 *   });
 *
 *   return <div>...</div>;
 * }
 * ```
 */

import { useEffect, useCallback, useRef } from 'react';
import { useStyleActions, type StyleName } from '../state';

/** Style names for keyboard shortcuts (1-5 keys) */
const STYLE_NAMES: StyleName[] = [
  'SuperformulaBlossom',
  'FourierBloom',
  'SpiralRidges',
  'SuperellipseMorph',
  'HarmonicRipple',
];

/** Shortcut handler callbacks */
export interface KeyboardShortcutHandlers {
  /** Called when Ctrl+S is pressed */
  onExport?: () => void;
  /** Called when Ctrl+R is pressed */
  onReset?: () => void;
  /** Called when Ctrl+P is pressed */
  onTogglePanel?: () => void;
  /** Called when ? is pressed */
  onShowHelp?: () => void;
  /** Called when Escape is pressed */
  onEscape?: () => void;
  /** Called when Ctrl+Z is pressed */
  onUndo?: () => void;
  /** Called when Ctrl+Shift+Z is pressed */
  onRedo?: () => void;
  /** Called when Space is pressed (for auto-rotate toggle) */
  onToggleAutoRotate?: () => void;
  /** Whether shortcuts are enabled */
  enabled?: boolean;
}

/** Shortcut definition */
interface ShortcutDef {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  description: string;
  action: string;
}

/** All available shortcuts with their definitions */
export const SHORTCUTS: ShortcutDef[] = [
  { key: 's', ctrl: true, description: 'Export STL file', action: 'export' },
  { key: 'r', ctrl: true, description: 'Reset to defaults', action: 'reset' },
  { key: 'p', ctrl: true, description: 'Toggle control panel', action: 'togglePanel' },
  { key: '1', description: 'Superformula style', action: 'style0' },
  { key: '2', description: 'Fourier style', action: 'style1' },
  { key: '3', description: 'Spiral style', action: 'style2' },
  { key: '4', description: 'Superellipse style', action: 'style3' },
  { key: '5', description: 'Harmonic style', action: 'style4' },
  { key: ' ', description: 'Toggle auto-rotate', action: 'toggleRotate' },
  { key: 'Escape', description: 'Close dialog', action: 'escape' },
  { key: '?', description: 'Show shortcuts help', action: 'showHelp' },
  { key: 'z', ctrl: true, description: 'Undo', action: 'undo' },
  { key: 'z', ctrl: true, shift: true, description: 'Redo', action: 'redo' },
];

/**
 * Get formatted shortcut string for display
 *
 * @param shortcut - Shortcut definition
 * @returns Formatted string like "Ctrl+S"
 */
export function formatShortcut(shortcut: ShortcutDef): string {
  const parts: string[] = [];

  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.shift) parts.push('Shift');
  if (shortcut.alt) parts.push('Alt');

  // Format special keys
  let keyDisplay = shortcut.key;
  if (keyDisplay === ' ') keyDisplay = 'Space';
  if (keyDisplay === 'Escape') keyDisplay = 'Esc';
  if (/^[a-z]$/.test(keyDisplay)) keyDisplay = keyDisplay.toUpperCase();

  parts.push(keyDisplay);

  return parts.join('+');
}

/**
 * Get all shortcuts grouped by category
 *
 * @returns Grouped shortcuts for help display
 */
export function getShortcutGroups(): Map<string, ShortcutDef[]> {
  const groups = new Map<string, ShortcutDef[]>();

  const fileShortcuts = SHORTCUTS.filter((s) =>
    ['export', 'reset', 'undo', 'redo'].includes(s.action)
  );
  const styleShortcuts = SHORTCUTS.filter((s) => s.action.startsWith('style'));
  const viewShortcuts = SHORTCUTS.filter((s) =>
    ['togglePanel', 'toggleRotate', 'escape', 'showHelp'].includes(s.action)
  );

  groups.set('File', fileShortcuts);
  groups.set('Styles', styleShortcuts);
  groups.set('View', viewShortcuts);

  return groups;
}

/**
 * Check if an element is an input element
 *
 * @param element - DOM element to check
 * @returns True if element is input, textarea, or contenteditable
 */
function isInputElement(element: EventTarget | null): boolean {
  if (!element || !(element instanceof HTMLElement)) return false;

  const tagName = element.tagName.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  return element.contentEditable === 'true';
}

/**
 * Global keyboard shortcuts hook
 *
 * Registers keyboard event listeners and dispatches to appropriate handlers.
 * Automatically handles:
 * - Input element focus (disables shortcuts when typing)
 * - Modifier key combinations
 * - Style selection (1-5 keys)
 * - Auto-rotate toggle (Space)
 *
 * @param handlers - Callback functions for shortcut actions
 */
export function useKeyboardShortcuts(handlers: KeyboardShortcutHandlers = {}): void {
  const {
    onExport,
    onReset,
    onTogglePanel,
    onShowHelp,
    onEscape,
    onUndo,
    onRedo,
    onToggleAutoRotate,
    enabled = true,
  } = handlers;

  // Store access for style changes
  const { setStyle } = useStyleActions();

  // Use refs for handlers to avoid recreating the event listener
  const handlersRef = useRef({
    onExport,
    onReset,
    onTogglePanel,
    onShowHelp,
    onEscape,
    onUndo,
    onRedo,
    onToggleAutoRotate,
  });

  // Update refs when handlers change
  useEffect(() => {
    handlersRef.current = {
      onExport,
      onReset,
      onTogglePanel,
      onShowHelp,
      onEscape,
      onUndo,
      onRedo,
      onToggleAutoRotate,
    };
  }, [onExport, onReset, onTogglePanel, onShowHelp, onEscape, onUndo, onRedo, onToggleAutoRotate]);

  // Main keyboard event handler
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Skip if disabled or in input element (except for Escape)
      if (!enabled) return;
      if (event.key !== 'Escape' && isInputElement(event.target)) return;

      const { ctrlKey, shiftKey, metaKey, key } = event;
      const ctrl = ctrlKey || metaKey; // Support Cmd on Mac

      // Ctrl+S: Export
      if (ctrl && key.toLowerCase() === 's') {
        event.preventDefault();
        handlersRef.current.onExport?.();
        return;
      }

      // Ctrl+R: Reset (prevent browser refresh)
      if (ctrl && key.toLowerCase() === 'r' && !shiftKey) {
        event.preventDefault();
        handlersRef.current.onReset?.();
        return;
      }

      // Ctrl+P: Toggle panel (prevent print dialog)
      if (ctrl && key.toLowerCase() === 'p') {
        event.preventDefault();
        handlersRef.current.onTogglePanel?.();
        return;
      }

      // Ctrl+Z: Undo
      if (ctrl && key.toLowerCase() === 'z' && !shiftKey) {
        event.preventDefault();
        handlersRef.current.onUndo?.();
        return;
      }

      // Ctrl+Shift+Z: Redo
      if (ctrl && key.toLowerCase() === 'z' && shiftKey) {
        event.preventDefault();
        handlersRef.current.onRedo?.();
        return;
      }

      // Number keys 1-5: Style selection (no modifiers)
      if (!ctrl && !shiftKey && key >= '1' && key <= '5') {
        const styleIndex = parseInt(key, 10) - 1;
        const styleName = STYLE_NAMES[styleIndex];
        if (styleName) {
          setStyle(styleName);
        }
        return;
      }

      // Space: Toggle auto-rotate
      if (key === ' ' && !ctrl && !shiftKey) {
        event.preventDefault(); // Prevent page scroll
        handlersRef.current.onToggleAutoRotate?.();
        return;
      }

      // Escape: Close dialog/cancel
      if (key === 'Escape') {
        handlersRef.current.onEscape?.();
        return;
      }

      // ?: Show help
      if (key === '?' || (shiftKey && key === '/')) {
        handlersRef.current.onShowHelp?.();
        return;
      }
    },
    [enabled, setStyle]
  );

  // Register/unregister event listener
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, handleKeyDown]);
}

/**
 * Hook to get just the shortcut definitions without handlers
 * Useful for displaying shortcuts in help UI
 *
 * @returns All shortcut definitions
 */
export function useShortcutDefinitions(): ShortcutDef[] {
  return SHORTCUTS;
}

/**
 * Default export for convenience
 */
export default useKeyboardShortcuts;
