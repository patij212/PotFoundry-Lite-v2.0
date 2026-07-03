/**
 * TouchModeContext — carries the touch-mode flag through the v3 shell.
 *
 * `useTouchMode()` returns `false` when called outside a provider, so every
 * existing desktop test remains safe without any wrapper changes.
 */
import React, { createContext, useContext } from 'react';

const TouchModeContext = createContext<boolean>(false);

/** Wraps a subtree with a touch-mode value. */
export const TouchModeProvider: React.FC<{ value: boolean; children: React.ReactNode }> = ({
  value,
  children,
}) => <TouchModeContext.Provider value={value}>{children}</TouchModeContext.Provider>;

/**
 * Returns the current touch-mode flag.
 * Defaults to `false` when no `TouchModeProvider` is present in the tree.
 */
export function useTouchMode(): boolean {
  return useContext(TouchModeContext);
}
