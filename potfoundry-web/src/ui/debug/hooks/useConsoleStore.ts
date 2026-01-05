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
export type ConsoleTab = 'console' | 'health' | 'network' | 'state';

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
}

type ConsoleStore = ConsoleState & ConsoleActions;

// ============================================================================
// Constants
// ============================================================================

const MAX_LOGS = 500;
const MAX_NETWORK_ENTRIES = 500;
const MAX_PERF_SAMPLES = 120; // 2 hours at 1 sample/min
const MAX_COMMAND_HISTORY = 100;

// ============================================================================
// Store
// ============================================================================

export const useConsoleStore = create<ConsoleStore>()(
    persist(
        (set, get) => ({
            // Initial state
            isVisible: false,
            activeTab: 'console',
            logs: [],
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
                if (newLogs.length > MAX_LOGS) {
                    return { logs: newLogs.slice(-MAX_LOGS / 2) };
                }
                return { logs: newLogs };
            }),

            setLogs: (logs) => set({ logs }),
            clearLogs: () => set({ logs: [] }),

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
                pinnedIds: Array.from(state.pinnedIds),
                bookmarkedIds: Array.from(state.bookmarkedIds),
            }),
            merge: (persisted: any, current) => ({
                ...current,
                ...persisted,
                filterLevels: new Set(persisted?.filterLevels ?? ['INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG']),
                pinnedIds: new Set(persisted?.pinnedIds ?? []),
                bookmarkedIds: new Set(persisted?.bookmarkedIds ?? []),
            }),
        }
    )
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
}));
