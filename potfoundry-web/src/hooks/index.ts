/**
 * Custom React hooks module.
 * 
 * @module hooks
 */

export { useDebouncedMerge, type MergeCallback } from './useDebouncedMerge';
export { useRendererBridge, syncStoreFromParams, type RendererBridgeOptions } from './useRendererBridge';
export { usePerformanceTracker, parseStatusMetrics, type PerformanceMetrics, type PerformanceTrackerOptions } from './usePerformanceTracker';
export { useExport, type UseExportResult, type ExportProgress, type ExportStats } from './useExport';
export {
  useExportTier,
  getExportQualityLimits,
  FREE_TIER_MONTHLY_LIMIT,
  type UseExportTierResult,
  type ExportTierCheck,
} from './useExportTier';
export {
  useKeyboardShortcuts,
  useShortcutDefinitions,
  formatShortcut,
  getShortcutGroups,
  SHORTCUTS,
  type KeyboardShortcutHandlers,
} from './useKeyboardShortcuts';

