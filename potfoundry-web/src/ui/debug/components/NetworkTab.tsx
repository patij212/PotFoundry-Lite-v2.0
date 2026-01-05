/**
 * Network traffic panel for DevConsole.
 * 
 * Displays captured fetch/XHR requests with timing and status.
 * 
 * @module ui/debug/components/NetworkTab
 */

import React, { useMemo, useState } from 'react';
import { NetworkEntry, useConsoleStore } from '../hooks/useConsoleStore';

type SortKey = 'startTime' | 'duration' | 'status' | 'size';
type SortDir = 'asc' | 'desc';

/**
 * Format bytes to human readable size.
 */
function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return '—';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Format duration in ms.
 */
function formatDuration(ms: number | undefined): string {
    if (ms === undefined) return '—';
    if (ms < 1000) return `${ms.toFixed(0)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

/**
 * Get status color class.
 */
function getStatusClass(status: number): string {
    if (status === 0) return 'pf-net-status--error';
    if (status >= 200 && status < 300) return 'pf-net-status--success';
    if (status >= 300 && status < 400) return 'pf-net-status--redirect';
    if (status >= 400 && status < 500) return 'pf-net-status--client-error';
    if (status >= 500) return 'pf-net-status--server-error';
    return '';
}

/**
 * Get method color class.
 */
function getMethodClass(method: string): string {
    switch (method) {
        case 'GET': return 'pf-net-method--get';
        case 'POST': return 'pf-net-method--post';
        case 'PUT': return 'pf-net-method--put';
        case 'DELETE': return 'pf-net-method--delete';
        case 'PATCH': return 'pf-net-method--patch';
        default: return '';
    }
}

interface NetworkRowProps {
    entry: NetworkEntry;
    isSelected: boolean;
    onClick: () => void;
}

const NetworkRow: React.FC<NetworkRowProps> = ({ entry, isSelected, onClick }) => {
    // Extract path from URL
    let displayUrl = entry.url;
    try {
        const url = new URL(entry.url);
        displayUrl = url.pathname + url.search;
    } catch { /* keep full URL */ }

    return (
        <tr
            className={`pf-net-row ${isSelected ? 'pf-net-row--selected' : ''} ${entry.error ? 'pf-net-row--error' : ''}`}
            onClick={onClick}
        >
            <td className={`pf-net-method ${getMethodClass(entry.method)}`}>
                {entry.method}
            </td>
            <td className="pf-net-url" title={entry.url}>
                {displayUrl}
            </td>
            <td className={`pf-net-status ${getStatusClass(entry.status)}`}>
                {entry.status || 'ERR'}
            </td>
            <td className="pf-net-duration">
                {formatDuration(entry.duration)}
            </td>
            <td className="pf-net-size">
                {formatBytes(entry.size)}
            </td>
        </tr>
    );
};

export const NetworkTab: React.FC = () => {
    const entries = useConsoleStore((s) => s.networkEntries);
    const clearNetwork = useConsoleStore((s) => s.clearNetwork);

    const [sortKey, setSortKey] = useState<SortKey>('startTime');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [filter, setFilter] = useState('');
    const [selectedId, setSelectedId] = useState<string | null>(null);

    const selectedEntry = useMemo(() => {
        return entries.find(e => e.id === selectedId);
    }, [entries, selectedId]);

    const filteredEntries = useMemo(() => {
        let result = [...entries];

        // Apply filter
        if (filter) {
            const lowerFilter = filter.toLowerCase();
            result = result.filter(e =>
                e.url.toLowerCase().includes(lowerFilter) ||
                e.method.toLowerCase().includes(lowerFilter)
            );
        }

        // Sort
        result.sort((a, b) => {
            let cmp = 0;
            switch (sortKey) {
                case 'startTime':
                    cmp = a.startTime - b.startTime;
                    break;
                case 'duration':
                    cmp = (a.duration ?? 0) - (b.duration ?? 0);
                    break;
                case 'status':
                    cmp = a.status - b.status;
                    break;
                case 'size':
                    cmp = (a.size ?? 0) - (b.size ?? 0);
                    break;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });

        return result;
    }, [entries, filter, sortKey, sortDir]);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortKey(key);
            setSortDir('desc');
        }
    };

    const SortHeader: React.FC<{ label: string; sortKey: SortKey }> = ({ label, sortKey: key }) => (
        <th
            className={`pf-net-th ${sortKey === key ? 'pf-net-th--sorted' : ''}`}
            onClick={() => handleSort(key)}
        >
            {label}
            {sortKey === key && (
                <span className="pf-net-sort-indicator">
                    {sortDir === 'asc' ? '↑' : '↓'}
                </span>
            )}
        </th>
    );

    return (
        <div className="pf-net-container">
            {/* Toolbar */}
            <div className="pf-net-toolbar">
                <input
                    type="text"
                    className="pf-console-search"
                    placeholder="Filter by URL or method..."
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                />
                <span className="pf-net-count">
                    {filteredEntries.length} request{filteredEntries.length !== 1 ? 's' : ''}
                </span>
                <button className="pf-console-btn" onClick={clearNetwork}>
                    CLEAR
                </button>
            </div>

            {/* Table */}
            <div className="pf-net-table-wrapper">
                {entries.length === 0 ? (
                    <div className="pf-net-empty">
                        <p>No network requests captured yet.</p>
                        <p className="pf-net-empty-hint">
                            Requests will appear here as they occur.
                        </p>
                    </div>
                ) : (
                    <table className="pf-net-table">
                        <thead>
                            <tr>
                                <th className="pf-net-th">Method</th>
                                <th className="pf-net-th">URL</th>
                                <SortHeader label="Status" sortKey="status" />
                                <SortHeader label="Time" sortKey="duration" />
                                <SortHeader label="Size" sortKey="size" />
                            </tr>
                        </thead>
                        <tbody>
                            {filteredEntries.map((entry) => (
                                <NetworkRow
                                    key={entry.id}
                                    entry={entry}
                                    isSelected={entry.id === selectedId}
                                    onClick={() => setSelectedId(entry.id === selectedId ? null : entry.id)}
                                />
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Details Panel */}
            {selectedEntry && (
                <div className="pf-net-details">
                    <div className="pf-net-details-header">
                        <span className={`pf-net-method ${getMethodClass(selectedEntry.method)}`}>
                            {selectedEntry.method}
                        </span>
                        <span className="pf-net-details-url">{selectedEntry.url}</span>
                    </div>
                    <div className="pf-net-details-body">
                        <div className="pf-net-detail-row">
                            <span className="pf-net-detail-label">Status:</span>
                            <span className={getStatusClass(selectedEntry.status)}>
                                {selectedEntry.status || 'Failed'}
                            </span>
                        </div>
                        <div className="pf-net-detail-row">
                            <span className="pf-net-detail-label">Duration:</span>
                            <span>{formatDuration(selectedEntry.duration)}</span>
                        </div>
                        <div className="pf-net-detail-row">
                            <span className="pf-net-detail-label">Size:</span>
                            <span>{formatBytes(selectedEntry.size)}</span>
                        </div>
                        {selectedEntry.error && (
                            <div className="pf-net-detail-row pf-net-detail-row--error">
                                <span className="pf-net-detail-label">Error:</span>
                                <span>{selectedEntry.error}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
