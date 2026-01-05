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
import { LogLevel } from '../../infra/logging/types';
import { useConsoleStore, ConsoleTab, ProcessedLog } from './hooks/useConsoleStore';
import { installNetworkMonitor } from './utils/NetworkMonitor';
import { executeCommand } from './utils/CommandRegistry';
import { generateLogId, exportLogsAsJSON, exportLogsAsText, copyLogsToClipboard, matchesSearch } from './utils/exportLogs';
import { LogRow } from './components/LogRow';
import { NetworkTab } from './components/NetworkTab';
import { MetricCard } from './components/Sparkline';
import { ResizeHandle, useResizable } from './components/ResizeHandle';
import { StateInspector } from './components/StateInspector';
import './ConsoleOverlay.css';

// ============================================================================
// Constants
// ============================================================================

const TABS: { id: ConsoleTab; label: string; icon: string }[] = [
    { id: 'console', label: 'Console', icon: '📝' },
    { id: 'network', label: 'Network', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' },
    { id: 'state', label: 'State', icon: '🔧' },
];

// ============================================================================
// Main Component
// ============================================================================

export const ConsoleOverlayV2: React.FC = () => {
    // Store state
    const isVisible = useConsoleStore(s => s.isVisible);
    const activeTab = useConsoleStore(s => s.activeTab);
    const logs = useConsoleStore(s => s.logs);
    const filterLevels = useConsoleStore(s => s.filterLevels);
    const search = useConsoleStore(s => s.search);
    const isRegexSearch = useConsoleStore(s => s.isRegexSearch);
    const groupDuplicates = useConsoleStore(s => s.groupDuplicates);
    const pinnedIds = useConsoleStore(s => s.pinnedIds);
    const bookmarkedIds = useConsoleStore(s => s.bookmarkedIds);
    const commandHistory = useConsoleStore(s => s.commandHistory);
    const historyIndex = useConsoleStore(s => s.historyIndex);
    const dockPosition = useConsoleStore(s => s.dockPosition);
    const fontSize = useConsoleStore(s => s.fontSize);
    const theme = useConsoleStore(s => s.theme);
    const timestampFormat = useConsoleStore(s => s.timestampFormat);
    const perfSamples = useConsoleStore(s => s.perfSamples);

    // Store actions
    const {
        toggleVisible,
        setVisible,
        setActiveTab,
        setLogs,
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
        addPerfSample,
        setDockPosition,
    } = useConsoleStore.getState();

    // Local state
    const [command, setCommand] = useState('');
    const [selectedLogIndex, setSelectedLogIndex] = useState<number | null>(null);
    const [showShortcuts, setShowShortcuts] = useState(false);
    const [showExportMenu, setShowExportMenu] = useState(false);

    // Refs
    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Resize hook
    const { size: panelHeight, handleResize, handleResizeEnd } = useResizable({
        initial: useConsoleStore.getState().panelHeight,
        min: 200,
        max: window.innerHeight * 0.8,
        direction: 'vertical',
        persist: 'pf-console-height',
    });

    // Performance data for sparklines
    const fpsData = useMemo(() => perfSamples.map(s => s.fps ?? 0), [perfSamples]);
    const drawsData = useMemo(() => perfSamples.map(s => s.draws ?? 0), [perfSamples]);

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

    // Heartbeat stats
    const [stats, setStats] = useState(manager.getLastHeartbeatStats());

    // ============================================================================
    // Effects
    // ============================================================================

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

            // Show shortcuts
            if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                setShowShortcuts(prev => !prev);
                return;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isVisible, toggleVisible, setVisible]);

    // Subscribe to logs
    useEffect(() => {
        setLogs(manager.dumpRecent());

        const unsubscribe = manager.subscribe((msg) => {
            const state = useConsoleStore.getState();
            const prevLogs = state.logs;

            if (prevLogs.length > 0 && prevLogs[prevLogs.length - 1] === msg) {
                useConsoleStore.setState({ logs: [...prevLogs] });
            } else {
                const newLogs = [...prevLogs, msg];
                if (newLogs.length > 2000) {
                    useConsoleStore.setState({ logs: newLogs.slice(-1000) });
                } else {
                    useConsoleStore.setState({ logs: newLogs });
                }
            }
        });

        return unsubscribe;
    }, [setLogs]);

    // Install network monitor
    useEffect(() => {
        const cleanup = installNetworkMonitor((entry) => {
            addNetworkEntry(entry);
        });
        return cleanup;
    }, [addNetworkEntry]);

    // Update stats periodically
    useEffect(() => {
        if (!isVisible) return;

        const interval = setInterval(() => {
            const newStats = manager.getLastHeartbeatStats();
            setStats(newStats);

            if (newStats) {
                const fps = newStats.frames
                    ? (newStats.frames / (newStats.windowMs / 1000))
                    : undefined;
                addPerfSample({
                    ts: Date.now(),
                    fps,
                    draws: newStats.draws,
                    verts: newStats.verts,
                });
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isVisible, addPerfSample]);

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

    const handleCommandKeyDown = useCallback((e: React.KeyboardEvent) => {
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
    }, [commandHistory, historyIndex, setHistoryIndex]);

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

    return (
        <>
            <div
                className={`pf-console-overlay ${dockClass} ${themeClass} ${fontClass} ${!isVisible ? 'pf-console-overlay--hidden' : ''}`}
                style={dockPosition === 'bottom' ? { height: panelHeight } : undefined}
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
                <div className="pf-console-header">
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

                                <button
                                    className={`pf-console-btn pf-console-btn--timestamp`}
                                    onClick={() => useConsoleStore.getState().setTimestampFormat(
                                        timestampFormat === 'absolute' ? 'relative' : 'absolute'
                                    )}
                                    title={`Switch to ${timestampFormat === 'absolute' ? 'relative' : 'absolute'} timestamps`}
                                >
                                    {timestampFormat === 'absolute' ? '🕐' : '⏱️'}
                                </button>

                                <div className="pf-console-spacer" />

                                {/* Export Menu */}
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

                                <button className="pf-console-btn" onClick={clearLogs}>
                                    Clear
                                </button>
                            </div>

                            {/* Pinned Logs */}
                            {pinnedLogs.length > 0 && (
                                <div className="pf-console-pinned">
                                    <div className="pf-console-pinned-header">📌 Pinned</div>
                                    {pinnedLogs.map((log, i) => (
                                        <LogRow
                                            key={`pinned-${i}-${log.id}`}
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

                            {/* Log List */}
                            <div className="pf-console-logs" role="log">
                                {unpinnedLogs.map((log, i) => (
                                    <LogRow
                                        key={`log-${i}-${log.id}`}
                                        log={log}
                                        search={search}
                                        isRegex={isRegexSearch}
                                        timestampFormat={timestampFormat}
                                        isPinned={false}
                                        isBookmarked={bookmarkedIds.has(log.id)}
                                        isSelected={selectedLogIndex === i}
                                        onClick={() => setSelectedLogIndex(i === selectedLogIndex ? null : i)}
                                        onPin={togglePinned}
                                        onBookmark={toggleBookmarked}
                                    />
                                ))}
                                <div ref={logsEndRef} />
                            </div>

                            {/* Command Input */}
                            <form className="pf-console-input-area" onSubmit={handleCommand}>
                                <span className="pf-console-prompt">&gt;</span>
                                <input
                                    ref={inputRef}
                                    type="text"
                                    className="pf-console-input"
                                    value={command}
                                    onChange={e => setCommand(e.target.value)}
                                    onKeyDown={handleCommandKeyDown}
                                    placeholder="Enter command or /help..."
                                    aria-label="Command input"
                                />
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
                                    value={stats?.frames ? Math.round(stats.frames / (stats.windowMs / 1000)) : '-'}
                                    data={fpsData}
                                    color="#4ade80"
                                />
                                <MetricCard
                                    label="Draw Calls"
                                    value={stats?.draws ?? '-'}
                                    data={drawsData}
                                    color="#60a5fa"
                                />
                                <MetricCard
                                    label="Vertices"
                                    value={stats?.verts?.toLocaleString() ?? '-'}
                                />
                                <MetricCard
                                    label="Log Buffer"
                                    value={logs.length}
                                    unit="entries"
                                />
                                <MetricCard
                                    label="Suppressed"
                                    value={stats?.suppressedDuplicates ?? 0}
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
                                <tr><td><kbd>↑</kbd>/<kbd>↓</kbd></td><td>Navigate command history</td></tr>
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
