import React, { useState, useEffect, useRef } from 'react';
import manager from '../../infra/logging/MessageManager';
import { LogMessage, LogLevel } from '../../infra/logging/types';
import './ConsoleOverlay.css';

interface ConsoleOverlayProps {
}

type Tab = 'console' | 'health';

// Helper to format timestamp
const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
};

// Helper to persist/load settings
const STORAGE_KEY = 'pf_console_settings';

interface ConsoleSettings {
    filterLevels: LogLevel[];
    groupDuplicates: boolean;
}

export const ConsoleOverlay: React.FC<ConsoleOverlayProps> = () => {
    const [isVisible, setIsVisible] = useState(false);
    const [activeTab, setActiveTab] = useState<Tab>('console');
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [search, setSearch] = useState('');

    // Load initial settings
    const [filterLevels, setFilterLevels] = useState<Set<LogLevel>>(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as ConsoleSettings;
                return new Set(parsed.filterLevels);
            }
        } catch { /* ignore */ }
        return new Set(['INFO', 'WARN', 'ERROR', 'CRITICAL', 'DEBUG']);
    });

    const [groupDuplicates, setGroupDuplicates] = useState(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved) as ConsoleSettings;
                return parsed.groupDuplicates ?? true;
            }
        } catch { /* ignore */ }
        return true;
    });

    const [command, setCommand] = useState('');
    const [history, setHistory] = useState<string[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);

    // Stats state
    const [stats, setStats] = useState(manager.getLastHeartbeatStats());

    // Persist settings
    useEffect(() => {
        const settings: ConsoleSettings = {
            filterLevels: Array.from(filterLevels),
            groupDuplicates
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }, [filterLevels, groupDuplicates]);

    // Grouping Logic (Smart Deduplication)
    const processedLogs = React.useMemo(() => {
        const filtered = logs.filter(l => {
            if (!filterLevels.has(l.level)) return false;
            if (search && !l.message.toLowerCase().includes(search.toLowerCase()) && !l.code.toLowerCase().includes(search.toLowerCase())) return false;
            return true;
        });

        if (!groupDuplicates) return filtered.map(l => ({ ...l, count: l.repeat || 1 }));

        const grouped: (LogMessage & { count: number })[] = [];
        let last: (LogMessage & { count: number }) | null = null;

        for (const log of filtered) {
            // Use signature for grouping if available, otherwise fallback to message+code
            const sameBroad = last && last.level === log.level && last.code === log.code;
            const sameSig = log.signature && last?.signature === log.signature;
            // If no signature, use exact message match (old behavior)
            const sameMsg = !log.signature && last?.message === log.message;

            if (sameBroad && (sameSig || sameMsg)) {
                if (last) {
                    last.count += (log.repeat || 1);
                    last.ts = log.ts;
                    // Update the displayed message/context to the latest one
                    last.message = log.message;
                    last.context = log.context;
                }
            } else {
                last = { ...log, count: log.repeat || 1 };
                grouped.push(last);
            }
        }
        return grouped;
    }, [logs, filterLevels, search, groupDuplicates]);

    const logsEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const handleCopy = () => {
        const text = processedLogs.map(l => `[${formatTime(l.ts)}] [${l.level}] ${l.message}${l.count > 1 ? ` (x${l.count})` : ''}`).join('\n');
        try {
            navigator.clipboard.writeText(text);
        } catch (err) {
            console.error('Failed to copy logs', err);
        }
    };

    const handleCommandKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (history.length > 0) {
                const nextIndex = historyIndex < history.length - 1 ? historyIndex + 1 : historyIndex;
                setHistoryIndex(nextIndex);
                const cmd = history[history.length - 1 - nextIndex];
                if (cmd) setCommand(cmd);
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex > 0) {
                const nextIndex = historyIndex - 1;
                setHistoryIndex(nextIndex);
                const cmd = history[history.length - 1 - nextIndex];
                if (cmd) setCommand(cmd);
            } else if (historyIndex === 0) {
                setHistoryIndex(-1);
                setCommand('');
            }
        }
    };

    // Toggle visibility with keyboard shortcut
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl + Backtick or just Backtick to toggle
            if (e.key === '`') {
                e.preventDefault();
                setIsVisible(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Subscribe to logs
    useEffect(() => {
        setLogs(manager.dumpRecent());
        const unsubscribe = manager.subscribe((msg) => {
            setLogs(prev => {
                // Backend deduplication sends the updated object reference.
                // If it's the exact same object as the tail, we force a re-render 
                // spread but DO NOT append it again.
                if (prev.length > 0 && prev[prev.length - 1] === msg) {
                    return [...prev];
                }
                const next = [...prev, msg];
                if (next.length > 2000) return next.slice(-1000); // Cap buffer
                return next;
            });
        });

        const statInterval = setInterval(() => {
            if (isVisible) {
                setStats(manager.getLastHeartbeatStats());
            }
        }, 1000);

        return () => {
            unsubscribe();
            clearInterval(statInterval);
        };
    }, [isVisible]);

    // Auto-scroll
    useEffect(() => {
        if (activeTab === 'console' && isVisible) {
            logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [processedLogs.length, activeTab, isVisible]);

    // Focus input when opened
    useEffect(() => {
        if (isVisible && activeTab === 'console') {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isVisible, activeTab]);

    const toggleLevel = (lvl: LogLevel) => {
        const next = new Set(filterLevels);
        if (next.has(lvl)) next.delete(lvl);
        else next.add(lvl);
        setFilterLevels(next);
    };

    const handleCommand = (e: React.FormEvent) => {
        e.preventDefault();
        if (!command.trim()) return;

        manager.info('CMD', `> ${command}`);
        setHistory(prev => {
            const next = [...prev, command];
            return next.slice(-50); // Keep last 50
        });
        setHistoryIndex(-1);

        // Quick and dirty command handler
        const parts = command.trim().split(' ');
        const cmd = parts[0].toLowerCase();

        switch (cmd) {
            case '/clear':
            case 'clear':
                setLogs([]);
                break;
            case '/help':
                manager.info('HELP', 'Available commands: /clear, /ping, /fps');
                break;
            case '/ping':
                manager.info('SYS', 'Pong!');
                break;
            default:
                manager.warn('CMD', `Unknown command: ${cmd}`);
        }

        setCommand('');
    };



    return (
        <div className={`pf-console-overlay ${!isVisible ? 'pf-console-overlay--hidden' : ''}`}>
            {/* Header */}
            <div className="pf-console-header">
                <div style={{ fontWeight: 'bold', marginRight: 8, color: '#fff' }}>DevConsole</div>
                <button
                    className={`pf-console-tab ${activeTab === 'console' ? 'pf-console-tab--active' : ''}`}
                    onClick={() => setActiveTab('console')}
                >
                    Console
                </button>
                <button
                    className={`pf-console-tab ${activeTab === 'health' ? 'pf-console-tab--active' : ''}`}
                    onClick={() => setActiveTab('health')}
                >
                    System Health
                </button>
                <div className="pf-console-spacer" />
                <button className="pf-console-close" onClick={() => setIsVisible(false)}>×</button>
            </div>

            <div className="pf-console-content">
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
                            />
                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
                            {(['DEBUG', 'INFO', 'WARN', 'ERROR'] as LogLevel[]).map(l => (
                                <button
                                    key={l}
                                    className={`pf-console-btn ${filterLevels.has(l) ? 'pf-console-btn--active' : ''}`}
                                    onClick={() => toggleLevel(l)}
                                >
                                    {l}
                                </button>
                            ))}
                            <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
                            <label className="pf-console-btn" style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={groupDuplicates}
                                    onChange={e => setGroupDuplicates(e.target.checked)}
                                    style={{ marginRight: 4 }}
                                />
                                Group
                            </label>
                            <div className="pf-console-spacer" />
                            <button className="pf-console-btn" onClick={handleCopy} title="Copy logs to clipboard">Copy</button>
                            <button className="pf-console-btn" onClick={() => setLogs([])}>Clear</button>
                        </div>

                        {/* Logs */}
                        <div className="pf-console-logs">
                            {processedLogs.map((log, i) => (
                                <div key={i} className={`pf-console-row pf-console-row--${log.level.toLowerCase()}`}>
                                    <span className="pf-console-ts">{formatTime(log.ts)}</span>
                                    <span className="pf-console-level">{log.level}</span>
                                    <div className="pf-console-msg">
                                        {log.message}
                                        {log.count > 1 && <span className="pf-console-count"> (x{log.count})</span>}
                                        {log.context && (
                                            <details className="pf-console-context-details">
                                                <summary>Details</summary>
                                                <pre className="pf-console-context">
                                                    {JSON.stringify(log.context, null, 2)}
                                                </pre>
                                            </details>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div ref={logsEndRef} />
                        </div>

                        {/* Input */}
                        <form className="pf-console-input-area" onSubmit={handleCommand}>
                            <span className="pf-console-prompt">&gt;</span>
                            <input
                                ref={inputRef}
                                type="text"
                                className="pf-console-input"
                                value={command}
                                onChange={e => setCommand(e.target.value)}
                                onKeyDown={handleCommandKeyDown}
                                placeholder="Enter command..."
                            />
                        </form>
                    </>
                )}

                {activeTab === 'health' && (
                    <div className="pf-console-metrics">
                        <MetricCard label="Frame Time (avg)" value={stats ? `${(1000 / (Math.max(stats.frames || 1, 1))).toFixed(1)}` : '-'} unit="ms" />
                        <MetricCard label="Heartbeat Frames" value={stats?.frames ?? 0} />
                        <MetricCard label="Draw Calls" value={stats?.draws ?? 0} />
                        <MetricCard label="Vertices" value={stats?.verts ?? 0} />
                        <MetricCard label="Suppressed Dupes" value={stats?.suppressedDuplicates ?? 0} />
                        <MetricCard label="Buffer Size" value={logs.length} />
                    </div>
                )}
            </div>
        </div>
    );
};

const MetricCard: React.FC<{ label: string; value: string | number; unit?: string }> = ({ label, value, unit }) => (
    <div className="pf-metric-card">
        <div className="pf-metric-label">{label}</div>
        <div className="pf-metric-value">
            {value}
            {unit && <span className="pf-metric-unit">{unit}</span>}
        </div>
    </div>
);
