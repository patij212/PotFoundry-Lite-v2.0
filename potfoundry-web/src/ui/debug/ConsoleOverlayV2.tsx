/**
 * DevConsole V2 - Enhanced Debug Console Overlay
 * 
 * Features:
 * - Resizable, dockable panel (bottom, right, float)
 * - Network traffic monitoring
 * - Performance sparklines
 * - Log pinning and bookmarking
 * - Search highlighting with regex support
 * - Extended slash commands
 * - Theme and font size customization
 * - Keyboard navigation
 * 
 * @module ui/debug/ConsoleOverlayV2
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import manager from '../../infra/logging/MessageManager';
import { LogLevel, LogMessage } from '../../infra/logging/types';
import { useConsoleStore, ConsoleTab, ProcessedLog, loadPersistedLogs } from './hooks/useConsoleStore';
import { installNetworkMonitor } from './utils/NetworkMonitor';
import { executeCommand, getCommands } from './utils/CommandRegistry';
import { generateLogId, exportLogsAsJSON, exportLogsAsText, copyLogsToClipboard, matchesSearch } from './utils/exportLogs';
import { LogRow } from './components/LogRow';
import { VirtualizedLogList } from './components/VirtualizedLogList';
import { NetworkTab } from './components/NetworkTab';
import { MetricCard } from './components/Sparkline';
import { ResizeHandle, useResizable } from './components/ResizeHandle';
import { StateInspector } from './components/StateInspector';
import { useDraggable } from './hooks/useDraggable';
import { GPUTab } from './tabs/GPUTab';
import { GeometryTab } from './tabs/GeometryTab';
import './ConsoleOverlay.css';

// ============================================================================
// Constants
// ============================================================================

const TABS: { id: ConsoleTab; label: string; icon: string }[] = [
    { id: 'console', label: 'Console', icon: '📝' },
    { id: 'network', label: 'Network', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' },
    { id: 'state', label: 'State', icon: '🔧' },
    { id: 'gpu', label: 'GPU', icon: '🎮' },
    { id: 'geometry', label: 'Geometry', icon: '📐' },
];

// Module-level initialization flag - survives component mounts/unmounts
let logsInitialized = false;

// ============================================================================
// Main Component
// ============================================================================

export const ConsoleOverlayV2: React.FC = () => {
    // Store state
    const timestampFormat = useConsoleStore(s => s.timestampFormat);
    const activeTab = useConsoleStore(s => s.activeTab);
    const logs = useConsoleStore(s => s.logs);
    const filterLevels = useConsoleStore(s => s.filterLevels);
    const search = useConsoleStore(s => s.search);
    const isRegexSearch = useConsoleStore(s => s.isRegexSearch);
    const isVisible = useConsoleStore(s => s.isVisible);
    const groupDuplicates = useConsoleStore(s => s.groupDuplicates);
    const pinnedIds = useConsoleStore(s => s.pinnedIds);
    const bookmarkedIds = useConsoleStore(s => s.bookmarkedIds);
    const commandHistory = useConsoleStore(s => s.commandHistory);
    const historyIndex = useConsoleStore(s => s.historyIndex);
    const dockPosition = useConsoleStore(s => s.dockPosition);
    const floatPosition = useConsoleStore(s => s.floatPosition);
    const fontSize = useConsoleStore(s => s.fontSize);
    const theme = useConsoleStore(s => s.theme);
    const persistLogs = useConsoleStore(s => s.persistLogs);

    // Store actions
    const {
        toggleVisible,
        setVisible,
        setActiveTab,
        clearLogs,
        togglePinned,
        toggleBookmarked,
        toggleFilterLevel,
        setSearch,
        setIsRegexSearch,
        setGroupDuplicates,
        addToHistory,
        setHistoryIndex,
        addNetworkEntry,
        setDockPosition,
        setFloatPosition,
        setPersistLogs,
    } = useConsoleStore.getState();

    // Local state
    const [command, setCommand] = useState('');
    const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);
    const [showAutocomplete, setShowAutocomplete] = useState(false);
    const [autocompleteIndex, setAutocompleteIndex] = useState(0);

    // Local state for health metrics (aggregated from store/manager)
    const [healthMetrics, setHealthMetrics] = useState({
        errors: 0, warns: 0, info: 0, fps: 0, draws: 0, verts: 0, suppressed: 0, windowMs: 0
    });
    const [fpsHistory, setFpsHistory] = useState<number[]>([]);
    const [drawsHistory, setDrawsHistory] = useState<number[]>([]);
    const [vertsHistory, setVertsHistory] = useState<number[]>([]);

    // Refs
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const logsContainerRef = useRef<HTMLDivElement>(null);

    // Local state for virtualized list height
    const [logsContainerHeight, setLogsContainerHeight] = useState(300);

    // Resize hook
    const { size: panelHeight, handleResize, handleResizeEnd } = useResizable({
        initial: useConsoleStore.getState().panelHeight,
        min: 200,
        max: window.innerHeight * 0.8,
        direction: 'vertical',
        persist: 'pf-console-height',
    });

    // Draggable hook for float mode
    const { position: dragPosition, isDragging, dragHandleProps } = useDraggable({
        initialPosition: floatPosition,
        onPositionChange: setFloatPosition,
        bounds: 'viewport',
    });


    // Process logs (filter, group, search)
    const processedLogs = useMemo((): ProcessedLog[] => {
        const filtered = logs.filter(l => {
            if (!filterLevels.has(l.level)) return false;
            if (search && !matchesSearch(l.message, search, isRegexSearch) &&
                !matchesSearch(l.code, search, isRegexSearch)) {
                return false;
            }
            return true;
        });

        if (!groupDuplicates) {
            return filtered.map(l => ({ ...l, count: l.repeat || 1, id: generateLogId(l) }));
        }

        const grouped: ProcessedLog[] = [];
        let last: ProcessedLog | null = null;

        for (const log of filtered) {
            const sameBroad = last && last.level === log.level && last.code === log.code;
            const sameSig = log.signature && last?.signature === log.signature;
            const sameMsg = !log.signature && last?.message === log.message;

            if (sameBroad && (sameSig || sameMsg) && last) {
                last.count += (log.repeat || 1);
                last.ts = log.ts;
                last.message = log.message;
                last.context = log.context;
            } else {
                last = { ...log, count: log.repeat || 1, id: generateLogId(log) };
                grouped.push(last);
            }
        }

        return grouped;
    }, [logs, filterLevels, search, isRegexSearch, groupDuplicates]);

    // Separate pinned logs
    const { pinnedLogs, unpinnedLogs } = useMemo(() => {
        const pinned: ProcessedLog[] = [];
        const unpinned: ProcessedLog[] = [];

        for (const log of processedLogs) {
            if (pinnedIds.has(log.id)) {
                pinned.push(log);
            } else {
                unpinned.push(log);
            }
        }

        return { pinnedLogs: pinned, unpinnedLogs: unpinned };
    }, [processedLogs, pinnedIds]);


    // ============================================================================
    // Effects
    // ============================================================================

    // Measure logs container height for virtualization
    // Must re-run when activeTab changes because the container is conditionally rendered
    useEffect(() => {
        // Only observe when on console tab and container exists
        if (activeTab !== 'console') return;
        
        const container = logsContainerRef.current;
        if (!container) return;
        
        // Get initial height after layout settles (requestAnimationFrame ensures paint is done)
        const rafId = requestAnimationFrame(() => {
            const initialHeight = container.getBoundingClientRect().height;
            if (initialHeight > 0) {
                setLogsContainerHeight(initialHeight);
            }
        });
        
        const observer = new ResizeObserver(entries => {
            for (const entry of entries) {
                setLogsContainerHeight(entry.contentRect.height);
            }
        });
        
        observer.observe(container);
        return () => {
            cancelAnimationFrame(rafId);
            observer.disconnect();
        };
    }, [activeTab]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Toggle console
            if (e.key === '`') {
                e.preventDefault();
                toggleVisible();
                return;
            }

            if (!isVisible) return;

            // Close with Escape
            if (e.key === 'Escape') {
                setVisible(false);
                setShowShortcuts(false);
                return;
            }

            // Clear logs with Ctrl+K
            if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                clearLogs();
                return;
            }

            // Focus search with Ctrl+F
            if (e.key === 'f' && (e.ctrlKey || e.metaKey) && activeTab === 'console') {
                e.preventDefault();
                const searchInput = document.querySelector('.pf-console-search') as HTMLInputElement;
                searchInput?.focus();
                searchInput?.select();
                return;
            }

            // Show shortcuts
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setShowShortcuts(prev => !prev);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, toggleVisible, setVisible, clearLogs, activeTab]);

    // Subscribe to logs - BATCHED to prevent performance issues
    // This effect runs once and maintains subscription for component lifetime
    useEffect(() => {
        // Only initialize logs ONCE per app lifetime (module-level flag)
        if (!logsInitialized) {
            logsInitialized = true;
            
            // First load any persisted logs (if persistence enabled)
            loadPersistedLogs();
            
            // If still empty after persistence load, seed from MessageManager
            const afterPersist = useConsoleStore.getState().logs;
            if (afterPersist.length === 0) {
                const recent = manager.dumpRecent();
                if (recent.length > 0) {
                    useConsoleStore.setState({ logs: recent });
                }
            }
        }

        // Queue for batching incoming logs
        let logQueue: LogMessage[] = [];
        let batchTimeout: number | null = null;

        const flushQueue = () => {
            if (logQueue.length === 0) {
                batchTimeout = null;
                return;
            }

            const currentState = useConsoleStore.getState();
            const prevLogs = currentState.logs;
            const newLogs = [...prevLogs, ...logQueue];
            // Keep buffer reasonable - trim to 90% of max when exceeded (less aggressive)
            const MAX_CONSOLE_LOGS = 5000;
            const trimmed = newLogs.length > MAX_CONSOLE_LOGS 
                ? newLogs.slice(-Math.floor(MAX_CONSOLE_LOGS * 0.9)) 
                : newLogs;
            useConsoleStore.setState({ logs: trimmed });
            logQueue = [];
            batchTimeout = null;
        };

        const unsubscribe = manager.subscribe((msg) => {
            logQueue.push(msg);
            // Batch updates every 1 second to reduce React work
            if (batchTimeout === null) {
                batchTimeout = window.setTimeout(flushQueue, 1000);
            }
        });

        return () => {
            unsubscribe();
            if (batchTimeout !== null) {
                window.clearTimeout(batchTimeout);
                // Flush any pending logs before unmounting
                flushQueue();
            }
        };
    }, []); // Empty deps - runs once on mount

    // Install network monitor
    useEffect(() => {
        const cleanup = installNetworkMonitor((entry) => {
            addNetworkEntry(entry);
        });
        return cleanup;
    }, [addNetworkEntry]);

    // Update health/metrics every second
    useEffect(() => {
        if (!isVisible) return;
        const interval = setInterval(() => {
            // Get fresh short-term stats for the UI without flushing global heartbeat
            const freshStats = manager.getUiStats();
            const currentStats = freshStats;
            if (currentStats) {
                setHealthMetrics({
                    errors: currentStats.counts.ERROR + currentStats.counts.CRITICAL,
                    warns: currentStats.counts.WARN,
                    info: currentStats.counts.INFO + currentStats.counts.DEBUG, // grouping info/debug
                    fps: Math.round((currentStats.frames || 0) * 1000 / (currentStats.windowMs || 1)), // frames per second
                    draws: currentStats.draws || 0,
                    verts: currentStats.verts || 0,
                    suppressed: currentStats.suppressedDuplicates || 0,
                    windowMs: currentStats.windowMs
                });

                // Update sparkline history
                const SPARKLINE_HISTORY = 60;
                setFpsHistory(prev => {
                    const val = Math.round((currentStats.frames || 0) * 1000 / (currentStats.windowMs || 1));
                    return [...prev.slice(-(SPARKLINE_HISTORY - 1)), val];
                });
                setDrawsHistory(prev => [...prev.slice(-(SPARKLINE_HISTORY - 1)), currentStats.draws || 0]);
                setVertsHistory(prev => [...prev.slice(-(SPARKLINE_HISTORY - 1)), currentStats.verts || 0]);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [isVisible]);

    // Auto-scroll
    useEffect(() => {
        if (isVisible && activeTab === 'console' && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [processedLogs.length, activeTab, isVisible]);

    // Focus input
    useEffect(() => {
        if (isVisible && activeTab === 'console') {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isVisible, activeTab]);

    // ============================================================================
    // Handlers
    // ============================================================================

    const handleCommand = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!command.trim()) return;

        manager.info('CMD', `> ${command}`);
        addToHistory(command);

        const wasSlashCommand = await executeCommand(command);

        if (!wasSlashCommand) {
            // Quick command aliases
            if (command.toLowerCase() === 'clear') {
                clearLogs();
            } else {
                manager.warn('CMD', `Unknown command. Type /help for available commands.`);
            }
        }

        setCommand('');
    }, [command, addToHistory, clearLogs]);

    // Autocomplete suggestions for slash commands (must be before handleCommandKeyDown)
    const autocompleteSuggestions = useMemo(() => {
        if (!command.startsWith('/') || command.includes(' ')) {
            return [];
        }
        const prefix = command.toLowerCase();
        const allCommands = getCommands();
        return Object.entries(allCommands)
            .filter(([name]) => name.toLowerCase().startsWith(prefix))
            .map(([name, { help }]) => ({ name, help }))
            .slice(0, 8); // Limit to 8 suggestions
    }, [command]);

    const handleCommandKeyDown = useCallback((e: React.KeyboardEvent) => {
        // Handle autocomplete with Tab
        if (e.key === 'Tab' && autocompleteSuggestions.length > 0) {
            e.preventDefault();
            const selected = autocompleteSuggestions[autocompleteIndex];
            if (selected) {
                setCommand(selected.name + ' ');
                setShowAutocomplete(false);
            }
            return;
        }

        // Navigate autocomplete with arrows when showing
        if (showAutocomplete && autocompleteSuggestions.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setAutocompleteIndex(i => (i + 1) % autocompleteSuggestions.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setAutocompleteIndex(i => (i - 1 + autocompleteSuggestions.length) % autocompleteSuggestions.length);
                return;
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                setShowAutocomplete(false);
                return;
            }
        }

        // Command history navigation
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (commandHistory.length > 0) {
                const nextIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
                setHistoryIndex(nextIndex);
                const cmd = commandHistory[commandHistory.length - 1 - nextIndex];
                if (cmd) setCommand(cmd);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const nextIndex = historyIndex - 1;
                setHistoryIndex(nextIndex);
                const cmd = commandHistory[commandHistory.length - 1 - nextIndex];
                if (cmd) setCommand(cmd);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setCommand('');
            }
        }
    }, [commandHistory, historyIndex, setHistoryIndex, autocompleteSuggestions, autocompleteIndex, showAutocomplete]);

    const handleCopy = useCallback(async () => {
        const success = await copyLogsToClipboard(processedLogs);
        if (success) {
            manager.info('SYS', 'Logs copied to clipboard');
        } else {
            manager.error('SYS', 'Failed to copy logs');
        }
    }, [processedLogs]);

    const handleExport = useCallback((format: 'json' | 'txt') => {
        if (format === 'json') {
            exportLogsAsJSON(logs);
        } else {
            exportLogsAsText(processedLogs);
        }
        setShowExportMenu(false);
        manager.info('SYS', `Logs exported as ${format.toUpperCase()}`);
    }, [logs, processedLogs]);

    // ============================================================================
    // Render
    // ============================================================================

    const dockClass = `pf-console-overlay--${dockPosition}`;
    const themeClass = `pf-console-overlay--${theme}`;
    const fontClass = `pf-console-overlay--font-${fontSize}`;

    // Float mode styles
    const floatStyle: React.CSSProperties | undefined = dockPosition === 'float' 
        ? { left: dragPosition.x, top: dragPosition.y, position: 'fixed' }
        : dockPosition === 'bottom' 
            ? { height: panelHeight } 
            : undefined;

    return (
        <>
            <div
                className={`pf-console-overlay ${dockClass} ${themeClass} ${fontClass} ${!isVisible ? 'pf-console-overlay--hidden' : ''} ${isDragging ? 'pf-console-overlay--dragging' : ''}`}
                style={floatStyle}
                role="region"
                aria-label="Developer Console"
            >
                {/* Resize Handle (for bottom dock) */}
                {dockPosition === 'bottom' && (
                    <ResizeHandle
                        direction="vertical"
                        onResize={handleResize}
                        onResizeEnd={handleResizeEnd}
                    />
                )}

                {/* Header */}
                <div 
                    className={`pf-console-header ${dockPosition === 'float' ? 'pf-console-header--draggable' : ''}`}
                    {...(dockPosition === 'float' ? dragHandleProps : {})}
                >
                    <div className="pf-console-title">DevConsole</div>

                    {/* Tabs */}
                    {TABS.map(tab => (
                        <button
                            key={tab.id}
                            className={`pf-console-tab ${activeTab === tab.id ? 'pf-console-tab--active' : ''}`}
                            onClick={() => setActiveTab(tab.id)}
                            role="tab"
                            aria-selected={activeTab === tab.id}
                        >
                            <span className="pf-console-tab-icon">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}

                    <div className="pf-console-spacer" />

                    {/* Settings */}
                    <button
                        className="pf-console-settings-btn"
                        onClick={() => setShowShortcuts(true)}
                        title="Keyboard shortcuts (?)"
                        aria-label="Show keyboard shortcuts"
                    >
                        ⌨️
                    </button>

                    {/* Dock Position */}
                    <select
                        className="pf-console-dock-select"
                        value={dockPosition}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- select value cast to DockPosition union type
                        onChange={(e) => setDockPosition(e.target.value as any)}
                        title="Panel position"
                    >
                        <option value="bottom">⬇️ Bottom</option>
                        <option value="right">➡️ Right</option>
                        <option value="float">📦 Float</option>
                    </select>

                    {/* Close */}
                    <button
                        className="pf-console-close"
                        onClick={() => setVisible(false)}
                        aria-label="Close console"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="pf-console-content">
                    {/* Console Tab */}
                    {activeTab === 'console' && (
                        <>
                            {/* Toolbar */}
                            <div className="pf-console-toolbar">
                                <input
                                    type="text"
                                    className="pf-console-search"
                                    placeholder="Filter logs..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    aria-label="Filter logs"
                                />
                                <button
                                    className={`pf-console-btn pf-console-btn--regex ${isRegexSearch ? 'pf-console-btn--active' : ''}`}
                                    onClick={() => setIsRegexSearch(!isRegexSearch)}
                                    title="Toggle regex search"
                                >
                                    .*
                                </button>

                                <div className="pf-console-divider" />

                                {(['DEBUG', 'INFO', 'WARN', 'ERROR'] as LogLevel[]).map(l => (
                                    <button
                                        key={l}
                                        className={`pf-console-btn pf-console-btn--level pf-console-btn--${l.toLowerCase()} ${filterLevels.has(l) ? 'pf-console-btn--active' : ''}`}
                                        onClick={() => toggleFilterLevel(l)}
                                    >
                                        {l}
                                    </button>
                                ))}

                                <div className="pf-console-divider" />

                                <label className="pf-console-btn pf-console-checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={groupDuplicates}
                                        onChange={e => setGroupDuplicates(e.target.checked)}
                                    />
                                    Group
                                </label>

                                <label className="pf-console-btn pf-console-checkbox-label" title="Persist logs across page reloads">
                                    <input
                                        type="checkbox"
                                        checked={persistLogs}
                                        onChange={e => setPersistLogs(e.target.checked)}
                                    />
                                    Persist
                                </label>

                                <button
                                    className={`pf-console-btn pf-console-btn--timestamp`}
                                    onClick={() => useConsoleStore.getState().setTimestampFormat(
                                        timestampFormat === 'absolute' ? 'relative' : 'absolute'
                                    )}
                                    title={`Switch to ${timestampFormat === 'absolute' ? 'relative' : 'absolute'} timestamps`}
                                >
                                    {timestampFormat === 'absolute' ? '🕐' : '⏱️'}
                                </button>

                                <div className="pf-console-divider" />
                                <button
                                    className="pf-console-btn"
                                    onClick={clearLogs}
                                    title="Clear logs (Ctrl+K)"
                                >
                                    Clear
                                </button>
                                <button
                                    className="pf-console-btn"
                                    onClick={() => {
                                        const allText = processedLogs.map(l => `${l.ts} [${l.level}] ${l.message}`).join('\n');
                                        navigator.clipboard.writeText(allText);
                                    }}
                                    title="Copy all logs to clipboard"
                                >
                                    Copy
                                </button>
                                <div className="pf-console-export-wrapper">
                                    <button
                                        className="pf-console-btn"
                                        onClick={() => setShowExportMenu(!showExportMenu)}
                                    >
                                        Export ▾
                                    </button>
                                    {showExportMenu && (
                                        <div className="pf-console-export-menu">
                                            <button onClick={handleCopy}>📋 Copy to Clipboard</button>
                                            <button onClick={() => handleExport('json')}>📄 Download JSON</button>
                                            <button onClick={() => handleExport('txt')}>📃 Download TXT</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pinned Logs */}
                            {pinnedLogs.length > 0 && (
                                <div className="pf-console-pinned">
                                    <div className="pf-console-pinned-header">📌 Pinned</div>
                                    {pinnedLogs.map((log) => (
                                        <LogRow
                                            key={log.id}
                                            log={log}
                                            search={search}
                                            isRegex={isRegexSearch}
                                            timestampFormat={timestampFormat}
                                            isPinned={true}
                                            isBookmarked={bookmarkedIds.has(log.id)}
                                            onPin={togglePinned}
                                            onBookmark={toggleBookmarked}
                                        />
                                    ))}
                                </div>
                            )}

                            {/* Log List (Virtualized) */}
                            <div className="pf-console-logs" role="log" ref={logsContainerRef}>
                                <VirtualizedLogList
                                    logs={unpinnedLogs}
                                    search={search}
                                    isRegex={isRegexSearch}
                                    timestampFormat={timestampFormat}
                                    pinnedIds={pinnedIds}
                                    bookmarkedIds={bookmarkedIds}
                                    selectedIndex={selectedLogIndex}
                                    onSelect={setSelectedLogIndex}
                                    onPin={togglePinned}
                                    onBookmark={toggleBookmarked}
                                    height={logsContainerHeight}
                                />
                            </div>

                            {/* Command Input */}
                            <form className="pf-console-input-area" onSubmit={handleCommand}>
                                <span className="pf-console-prompt">&gt;</span>
                                <div className="pf-console-input-wrapper">
                                    <input
                                        ref={inputRef}
                                        type="text"
                                        className="pf-console-input"
                                        value={command}
                                        onChange={e => {
                                            const val = e.target.value;
                                            setCommand(val);
                                            setShowAutocomplete(val.startsWith('/') && !val.includes(' '));
                                            setAutocompleteIndex(0);
                                        }}
                                        onKeyDown={handleCommandKeyDown}
                                        onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
                                        placeholder="Enter command or /help..."
                                        aria-label="Command input"
                                        autoComplete="off"
                                    />
                                    {/* Autocomplete Dropdown */}
                                    {showAutocomplete && autocompleteSuggestions.length > 0 && (
                                        <div className="pf-console-autocomplete">
                                            {autocompleteSuggestions.map((s, i) => (
                                                <div
                                                    key={s.name}
                                                    className={`pf-console-autocomplete-item ${i === autocompleteIndex ? 'pf-console-autocomplete-item--selected' : ''}`}
                                                    onMouseDown={() => {
                                                        setCommand(s.name + ' ');
                                                        setShowAutocomplete(false);
                                                        inputRef.current?.focus();
                                                    }}
                                                >
                                                    <span className="pf-autocomplete-cmd">{s.name}</span>
                                                    <span className="pf-autocomplete-help">{s.help}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </form>
                        </>
                    )}

                    {/* Network Tab */}
                    {activeTab === 'network' && <NetworkTab />}

                    {/* Health Tab */}
                    {activeTab === 'health' && (
                        <div className="pf-console-health">
                            <div className="pf-console-metrics">
                                <MetricCard
                                    label="FPS"
                                    value={healthMetrics.fps ?? '-'}
                                    data={fpsHistory}
                                    color="#4ade80"
                                />
                                <MetricCard
                                    label="Draw Calls"
                                    value={healthMetrics.draws ?? '-'}
                                    data={drawsHistory}
                                    color="#60a5fa"
                                />
                                <MetricCard
                                    label="Vertices"
                                    value={healthMetrics.verts?.toLocaleString() ?? '-'}
                                    data={vertsHistory}
                                    color="#f472b6"
                                />
                                <MetricCard
                                    label="Log Buffer"
                                    value={logs.length}
                                    unit="entries"
                                />
                                <MetricCard
                                    label="Suppressed"
                                    value={healthMetrics.suppressed ?? 0}
                                />
                                <MetricCard
                                    label="Network Requests"
                                    value={useConsoleStore.getState().networkEntries.length}
                                />
                            </div>
                        </div>
                    )}

                    {/* State Tab */}
                    {activeTab === 'state' && <StateInspector />}

                    {/* GPU Tab */}
                    {activeTab === 'gpu' && <GPUTab />}

                    {/* Geometry Tab */}
                    {activeTab === 'geometry' && <GeometryTab />}
                </div>
            </div>

            {/* Keyboard Shortcuts Modal */}
            {showShortcuts && (
                <div className="pf-console-modal-backdrop" onClick={() => setShowShortcuts(false)}>
                    <div className="pf-console-modal" onClick={e => e.stopPropagation()}>
                        <h3>Keyboard Shortcuts</h3>
                        <table className="pf-shortcuts-table">
                            <tbody>
                                <tr><td><kbd>`</kbd></td><td>Toggle console</td></tr>
                                <tr><td><kbd>Esc</kbd></td><td>Close console</td></tr>
                                <tr><td><kbd>Ctrl+K</kbd></td><td>Clear logs</td></tr>
                                <tr><td><kbd>Ctrl+F</kbd></td><td>Focus search</td></tr>
                                <tr><td><kbd>↑</kbd>/<kbd>↓</kbd></td><td>Navigate command history</td></tr>
                                <tr><td><kbd>Tab</kbd></td><td>Autocomplete command</td></tr>
                                <tr><td><kbd>?</kbd></td><td>Show this help</td></tr>
                            </tbody>
                        </table>
                        <h4>Commands</h4>
                        <table className="pf-shortcuts-table">
                            <tbody>
                                <tr><td><code>/help</code></td><td>Show available commands</td></tr>
                                <tr><td><code>/clear</code></td><td>Clear logs</td></tr>
                                <tr><td><code>/state</code></td><td>Dump Zustand store</td></tr>
                                <tr><td><code>/camera</code></td><td>Show camera state</td></tr>
                                <tr><td><code>/perf</code></td><td>Show performance info</td></tr>
                            </tbody>
                        </table>
                        <button className="pf-console-btn" onClick={() => setShowShortcuts(false)}>
                            Close
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

// Re-export as default for backward compatibility
export { ConsoleOverlayV2 as ConsoleOverlay };
