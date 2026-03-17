/**
 * Console state management using Zustand.
 * 
 * Manages all DevConsole state including logs, preferences, UI state,
 * network captures, and performance metrics.
 * 
 * @module ui/debug/hooks/useConsoleStore
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LogMessage, LogLevel } from '../../../infra/logging/types';

// ============================================================================
// Types
// ============================================================================

export type DockPosition = 'bottom' | 'right' | 'float';
export type FontSize = 'sm' | 'md' | 'lg';
export type Theme = 'dark' | 'light';
export type TimestampFormat = 'absolute' | 'relative';
export type ConsoleTab = 'console' | 'health' | 'network' | 'state' | 'gpu' | 'geometry';

export interface NetworkEntry {
    id: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS' | 'HEAD';
    url: string;
    status: number;
    startTime: number;
    endTime?: number;
    duration?: number;
    size?: number;
    error?: string;
    requestHeaders?: Record<string, string>;
    responseHeaders?: Record<string, string>;
}

export interface PerformanceSample {
    ts: number;
    fps?: number;
    draws?: number;
    verts?: number;
    memory?: number;
}

export interface ProcessedLog extends LogMessage {
    count: number;
    id: string;
}

// ============================================================================
// State Interface
// ============================================================================

interface ConsoleState {
    // Visibility
    isVisible: boolean;
    activeTab: ConsoleTab;

    // Logs
    logs: LogMessage[];
    pinnedIds: Set<string>;
    bookmarkedIds: Set<string>;

    // Filters
    filterLevels: Set<LogLevel>;
    search: string;
    isRegexSearch: boolean;
    groupDuplicates: boolean;

    // Command
    commandHistory: string[];
    historyIndex: number;

    // Network
    networkEntries: NetworkEntry[];

    // Performance
    perfSamples: PerformanceSample[];

    // Preferences (persisted)
    dockPosition: DockPosition;
    panelHeight: number;
    panelWidth: number;
    floatPosition: { x: number; y: number };
    fontSize: FontSize;
    theme: Theme;
    timestampFormat: TimestampFormat;
    persistLogs: boolean;
}

interface ConsoleActions {
    // Visibility
    setVisible: (visible: boolean) => void;
    toggleVisible: () => void;
    setActiveTab: (tab: ConsoleTab) => void;

    // Logs
    addLog: (log: LogMessage) => void;
    setLogs: (logs: LogMessage[]) => void;
    clearLogs: () => void;
    togglePinned: (id: string) => void;
    toggleBookmarked: (id: string) => void;

    // Filters
    toggleFilterLevel: (level: LogLevel) => void;
    setSearch: (search: string) => void;
    setIsRegexSearch: (isRegex: boolean) => void;
    setGroupDuplicates: (group: boolean) => void;

    // Command
    addToHistory: (command: string) => void;
    setHistoryIndex: (index: number) => void;

    // Network
    addNetworkEntry: (entry: NetworkEntry) => void;
    clearNetwork: () => void;

    // Performance
    addPerfSample: (sample: PerformanceSample) => void;

    // Preferences
    setDockPosition: (position: DockPosition) => void;
    setPanelHeight: (height: number) => void;
    setPanelWidth: (width: number) => void;
    setFloatPosition: (pos: { x: number; y: number }) => void;
    setFontSize: (size: FontSize) => void;
    setTheme: (theme: Theme) => void;
    setTimestampFormat: (format: TimestampFormat) => void;
    setPersistLogs: (persist: boolean) => void;
}

type ConsoleStore = ConsoleState & ConsoleActions;

// ============================================================================
// Constants
// ============================================================================

/** Maximum logs to keep in memory (increased for better debugging sessions) */
const MAX_LOGS = 5000;
const MAX_NETWORK_ENTRIES = 500;
const MAX_PERF_SAMPLES = 120; // 2 hours at 1 sample/min
const MAX_COMMAND_HISTORY = 100;

/** Storage key for persisted logs (separate from preferences) */
const LOG_STORAGE_KEY = 'pf-console-logs-v1';
/** Debounce delay for auto-saving logs (ms) */
const LOG_SAVE_DEBOUNCE_MS = 2000;

// ============================================================================
// Session Log Backup (survives HMR and store re-creation)
// ============================================================================

// Extend window type for TypeScript
declare global {
    interface Window {
        __pf_console_logs_backup?: LogMessage[];
    }
}

/** 
 * Get or create a window-level backup of logs.
 * This survives HMR and store re-creation during development.
 */
function getLogBackup(): LogMessage[] {
    if (typeof window !== 'undefined') {
        if (!window.__pf_console_logs_backup) {
            window.__pf_console_logs_backup = [];
        }
        return window.__pf_console_logs_backup;
    }
    return [];
}

/**
 * Update the window-level log backup.
 */
function updateLogBackup(logs: LogMessage[]): void {
    if (typeof window !== 'undefined') {
        window.__pf_console_logs_backup = logs;
    }
}

// ============================================================================
// Store
// ============================================================================

export const useConsoleStore = create<ConsoleStore>()(
    persist(
        (set, get) => ({
            // Initial state - restore logs from backup if available (survives HMR)
            isVisible: false,
            activeTab: 'console',
            logs: getLogBackup(),
            pinnedIds: new Set(),
            bookmarkedIds: new Set(),
            filterLevels: new Set(['INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG']),
            search: '',
            isRegexSearch: false,
            groupDuplicates: true,
            commandHistory: [],
            historyIndex: -1,
            networkEntries: [],
            perfSamples: [],
            dockPosition: 'bottom',
            panelHeight: 400,
            panelWidth: 500,
            floatPosition: { x: 100, y: 100 },
            fontSize: 'md',
            theme: 'dark',
            timestampFormat: 'absolute',
            persistLogs: false,

            // Actions
            setVisible: (visible) => set({ isVisible: visible }),
            toggleVisible: () => set((s) => ({ isVisible: !s.isVisible })),
            setActiveTab: (tab) => set({ activeTab: tab }),

            addLog: (log) => set((state) => {
                const existingLogs = state.logs;
                const lastLog = existingLogs.length > 0 ? existingLogs[existingLogs.length - 1] : null;

                // Backend deduplication: Check if same reference (already handled by MessageManager)
                if (lastLog && lastLog === log) {
                    // CRITICAL FIX: Do NOT create a new array if the reference is identical
                    // This prevents React state updates/re-renders when MessageManager updates the tail log
                    // returning partial state {} or null/undefined in zustand prevents update
                    return {};
                }

                const newLogs = [...existingLogs, log];
                let result: LogMessage[];
                if (newLogs.length > MAX_LOGS) {
                    // Trim to 90% of max (less aggressive than 50%)
                    result = newLogs.slice(-Math.floor(MAX_LOGS * 0.9));
                } else {
                    result = newLogs;
                }
                updateLogBackup(result);
                return { logs: result };
            }),

            setLogs: (logs) => {
                updateLogBackup(logs);
                set({ logs });
            },
            clearLogs: () => {
                updateLogBackup([]);
                set({ logs: [] });
            },

            togglePinned: (id) => set((state) => {
                const next = new Set(state.pinnedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { pinnedIds: next };
            }),

            toggleBookmarked: (id) => set((state) => {
                const next = new Set(state.bookmarkedIds);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return { bookmarkedIds: next };
            }),

            toggleFilterLevel: (level) => set((state) => {
                const next = new Set(state.filterLevels);
                if (next.has(level)) next.delete(level);
                else next.add(level);
                return { filterLevels: next };
            }),

            setSearch: (search) => set({ search }),
            setIsRegexSearch: (isRegex) => set({ isRegexSearch: isRegex }),
            setGroupDuplicates: (group) => set({ groupDuplicates: group }),

            addToHistory: (command) => set((state) => {
                const history = [...state.commandHistory, command];
                if (history.length > MAX_COMMAND_HISTORY) {
                    return { commandHistory: history.slice(-MAX_COMMAND_HISTORY), historyIndex: -1 };
                }
                return { commandHistory: history, historyIndex: -1 };
            }),

            setHistoryIndex: (index) => set({ historyIndex: index }),

            addNetworkEntry: (entry) => set((state) => {
                const entries = [...state.networkEntries, entry];
                if (entries.length > MAX_NETWORK_ENTRIES) {
                    return { networkEntries: entries.slice(-MAX_NETWORK_ENTRIES / 2) };
                }
                return { networkEntries: entries };
            }),

            clearNetwork: () => set({ networkEntries: [] }),

            addPerfSample: (sample) => set((state) => {
                const samples = [...state.perfSamples, sample];
                if (samples.length > MAX_PERF_SAMPLES) {
                    return { perfSamples: samples.slice(-MAX_PERF_SAMPLES) };
                }
                return { perfSamples: samples };
            }),

            setDockPosition: (position) => set({ dockPosition: position }),
            setPanelHeight: (height) => set({ panelHeight: height }),
            setPanelWidth: (width) => set({ panelWidth: width }),
            setFloatPosition: (pos) => set({ floatPosition: pos }),
            setFontSize: (size) => set({ fontSize: size }),
            setTheme: (theme) => set({ theme: theme }),
            setTimestampFormat: (format) => set({ timestampFormat: format }),
            setPersistLogs: (persist) => {
                set({ persistLogs: persist });
                if (!persist) {
                    // Clear persisted logs when disabled
                    try {
                        localStorage.removeItem(LOG_STORAGE_KEY);
                    } catch (e) {
                        // Ignore storage errors
                    }
                }
            },
        }),
        {
            name: 'pf-console-v2',
            partialize: (state) => ({
                // Only persist preferences, not runtime data
                filterLevels: Array.from(state.filterLevels),
                groupDuplicates: state.groupDuplicates,
                dockPosition: state.dockPosition,
                panelHeight: state.panelHeight,
                panelWidth: state.panelWidth,
                floatPosition: state.floatPosition,
                fontSize: state.fontSize,
                theme: state.theme,
                timestampFormat: state.timestampFormat,
                persistLogs: state.persistLogs,
                pinnedIds: Array.from(state.pinnedIds),
                bookmarkedIds: Array.from(state.bookmarkedIds),
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zustand persist merge callback receives untyped persisted state
            merge: (persisted: any, current) => {
                // CRITICAL: Only merge persisted PREFERENCES, never runtime state.
                // This protects logs from being wiped by stale/legacy localStorage data.
                // Runtime state must ALWAYS come from current (in-memory).
                return {
                    // Start with current state
                    ...current,
                    // Merge only recognized preferences from persisted state
                    dockPosition: persisted?.dockPosition ?? current.dockPosition,
                    panelHeight: persisted?.panelHeight ?? current.panelHeight,
                    panelWidth: persisted?.panelWidth ?? current.panelWidth,
                    floatPosition: persisted?.floatPosition ?? current.floatPosition,
                    fontSize: persisted?.fontSize ?? current.fontSize,
                    theme: persisted?.theme ?? current.theme,
                    timestampFormat: persisted?.timestampFormat ?? current.timestampFormat,
                    groupDuplicates: persisted?.groupDuplicates ?? current.groupDuplicates,
                    persistLogs: persisted?.persistLogs ?? false,
                    // Convert arrays back to Sets
                    filterLevels: new Set(persisted?.filterLevels ?? Array.from(current.filterLevels)),
                    pinnedIds: new Set(persisted?.pinnedIds ?? []),
                    bookmarkedIds: new Set(persisted?.bookmarkedIds ?? []),
                    // NEVER touch these - they're runtime-only:
                    // logs, networkEntries, perfSamples, commandHistory, historyIndex
                };
            },
        }
    )
);

// ============================================================================
// Log Persistence Utilities
// ============================================================================

/** Debounce timer for log saves */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Save logs to localStorage (debounced).
 * Only saves if persistLogs is enabled.
 */
function saveLogsToStorage(logs: LogMessage[]): void {
    if (!useConsoleStore.getState().persistLogs) return;

    if (saveTimer) {
        clearTimeout(saveTimer);
    }

    saveTimer = setTimeout(() => {
        try {
            // Serialize logs, keeping only essential fields to reduce storage size
            const serialized = logs.map((log) => ({
                ts: log.ts,
                level: log.level,
                code: log.code,
                message: log.message,
                context: log.context,
                signature: log.signature,
                repeat: log.repeat,
            }));
            localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(serialized));
        } catch (e) {
            // Storage might be full or unavailable - fail silently
            console.warn('[Console] Failed to persist logs:', e);
        }
        saveTimer = null;
    }, LOG_SAVE_DEBOUNCE_MS);
}

/**
 * Load persisted logs from localStorage.
 * Should be called once on application startup.
 */
export function loadPersistedLogs(): void {
    const state = useConsoleStore.getState();
    if (!state.persistLogs) return;

    try {
        const stored = localStorage.getItem(LOG_STORAGE_KEY);
        if (stored) {
            const logs = JSON.parse(stored) as LogMessage[];
            if (Array.isArray(logs) && logs.length > 0) {
                // Merge with any logs already captured (startup logs)
                const existing = state.logs;
                const merged = [...logs, ...existing].slice(-MAX_LOGS);
                useConsoleStore.setState({ logs: merged });
            }
        }
    } catch (e) {
        console.warn('[Console] Failed to load persisted logs:', e);
    }
}

// Subscribe to log changes and auto-save when persistence is enabled
useConsoleStore.subscribe(
    (state, prevState) => {
        if (state.logs !== prevState.logs && state.persistLogs) {
            saveLogsToStorage(state.logs);
        }
    }
);

// Subscribe to log changes and keep window backup in sync (survives HMR)
useConsoleStore.subscribe(
    (state, prevState) => {
        if (state.logs !== prevState.logs) {
            updateLogBackup(state.logs);
        }
    }
);

// ============================================================================
// Selectors
// ============================================================================

export const useConsoleVisible = () => useConsoleStore((s) => s.isVisible);
export const useConsoleLogs = () => useConsoleStore((s) => s.logs);
export const useConsolePrefs = () => useConsoleStore((s) => ({
    dockPosition: s.dockPosition,
    panelHeight: s.panelHeight,
    panelWidth: s.panelWidth,
    floatPosition: s.floatPosition,
    fontSize: s.fontSize,
    theme: s.theme,
    timestampFormat: s.timestampFormat,
    persistLogs: s.persistLogs,
}));

export const useSetPersistLogs = () => useConsoleStore((s) => s.setPersistLogs);
