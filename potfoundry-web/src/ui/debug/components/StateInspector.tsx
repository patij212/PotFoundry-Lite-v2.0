/**
 * State Inspector component for DevConsole.
 * 
 * Provides a collapsible tree view of the Zustand store state.
 * 
 * @module ui/debug/components/StateInspector
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../../state';

interface TreeNodeProps {
    name: string;
    value: unknown;
    depth: number;
    path: string;
    defaultExpanded?: boolean;
}

/**
 * Get display type and color for a value.
 */
function getTypeInfo(value: unknown): { type: string; color: string } {
    if (value === null) return { type: 'null', color: '#888' };
    if (value === undefined) return { type: 'undefined', color: '#888' };
    if (typeof value === 'string') return { type: 'string', color: '#a8ff80' };
    if (typeof value === 'number') return { type: 'number', color: '#80c8ff' };
    if (typeof value === 'boolean') return { type: 'boolean', color: '#ffb080' };
    if (typeof value === 'function') return { type: 'function', color: '#c080ff' };
    if (Array.isArray(value)) return { type: `array(${value.length})`, color: '#80ffff' };
    if (typeof value === 'object') {
        const keys = Object.keys(value as object);
        return { type: `object(${keys.length})`, color: '#ffff80' };
    }
    return { type: typeof value, color: '#ccc' };
}

/**
 * Format a value for inline display.
 */
function formatValue(value: unknown): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') {
        const truncated = value.length > 50 ? value.slice(0, 47) + '...' : value;
        return `"${truncated}"`;
    }
    if (typeof value === 'number') return String(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'function') return `ƒ ${value.name || 'anonymous'}()`;
    if (Array.isArray(value)) return `[${value.length} items]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value as object);
        return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
    }
    return String(value);
}

/**
 * Check if value is expandable.
 */
function isExpandable(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'function') return false;
    if (typeof value === 'object') {
        const keys = Object.keys(value as object);
        return keys.length > 0;
    }
    return false;
}

/**
 * Tree node component for recursive rendering.
 */
const TreeNode: React.FC<TreeNodeProps> = memo(({
    name,
    value,
    depth,
    path,
    defaultExpanded = false,
}) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const { type, color } = getTypeInfo(value);
    const expandable = isExpandable(value);
    const indent = depth * 16;

    const toggleExpanded = useCallback(() => {
        if (expandable) {
            setIsExpanded(prev => !prev);
        }
    }, [expandable]);

    const children = useMemo(() => {
        if (!isExpanded || !expandable) return null;

        if (Array.isArray(value)) {
            return value.map((item, index) => (
                <TreeNode
                    key={index}
                    name={`[${index}]`}
                    value={item}
                    depth={depth + 1}
                    path={`${path}[${index}]`}
                />
            ));
        }

        if (typeof value === 'object' && value !== null) {
            return Object.entries(value as object).map(([key, val]) => (
                <TreeNode
                    key={key}
                    name={key}
                    value={val}
                    depth={depth + 1}
                    path={`${path}.${key}`}
                />
            ));
        }

        return null;
    }, [isExpanded, expandable, value, depth, path]);

    return (
        <div className="pf-state-tree-node">
            <div
                className={`pf-state-tree-row ${expandable ? 'pf-state-tree-row--expandable' : ''}`}
                style={{ paddingLeft: indent }}
                onClick={toggleExpanded}
            >
                {expandable && (
                    <span className="pf-state-tree-arrow">
                        {isExpanded ? '▼' : '▶'}
                    </span>
                )}
                <span className="pf-state-tree-key">{name}</span>
                <span className="pf-state-tree-colon">: </span>
                <span className="pf-state-tree-type" style={{ color }}>{type}</span>
                {!expandable && (
                    <span className="pf-state-tree-value" style={{ color }}>
                        {formatValue(value)}
                    </span>
                )}
            </div>
            {children}
        </div>
    );
});

TreeNode.displayName = 'TreeNode';

/**
 * State Inspector component.
 */
export const StateInspector: React.FC = () => {
    const state = useAppStore();
    const [filter, setFilter] = useState('');
    const [autoRefresh, setAutoRefresh] = useState(false);
    const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
    const [, forceUpdate] = useState(0);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-refresh on store changes
    useEffect(() => {
        if (!autoRefresh) return;
        
        const unsubscribe = useAppStore.subscribe(() => {
            // Debounce updates to avoid thrashing
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
            debounceRef.current = setTimeout(() => {
                setLastUpdate(Date.now());
                forceUpdate(n => n + 1);
            }, 100);
        });
        
        return () => {
            unsubscribe();
            if (debounceRef.current) {
                clearTimeout(debounceRef.current);
            }
        };
    }, [autoRefresh]);

    // Get top-level slices (excluding functions)
    const slices = useMemo(() => {
        const entries: [string, unknown][] = [];

        for (const [key, value] of Object.entries(state)) {
            // Skip functions (actions)
            if (typeof value === 'function') continue;

            // Apply filter
            if (filter && !key.toLowerCase().includes(filter.toLowerCase())) continue;

            entries.push([key, value]);
        }

        return entries;
    }, [state, filter]);

    return (
        <div className="pf-state-inspector">
            {/* Toolbar */}
            <div className="pf-state-toolbar">
                <input
                    type="text"
                    className="pf-console-search"
                    placeholder="Filter slices..."
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                />
                <label className="pf-state-auto-refresh">
                    <input
                        type="checkbox"
                        checked={autoRefresh}
                        onChange={e => setAutoRefresh(e.target.checked)}
                    />
                    Auto
                </label>
                <button 
                    className="pf-console-btn"
                    onClick={() => {
                        setLastUpdate(Date.now());
                        forceUpdate(n => n + 1);
                    }}
                    title="Refresh state snapshot"
                >
                    ↻
                </button>
                <span className="pf-state-count">
                    {slices.length} slice{slices.length !== 1 ? 's' : ''}
                </span>
                <span className="pf-state-updated" title="Last updated">
                    {new Date(lastUpdate).toLocaleTimeString()}
                </span>
            </div>

            {/* Tree View */}
            <div className="pf-state-tree">
                {slices.length === 0 ? (
                    <div className="pf-state-empty">
                        {filter ? 'No matching slices found' : 'No state available'}
                    </div>
                ) : (
                    slices.map(([key, value]) => (
                        <TreeNode
                            key={key}
                            name={key}
                            value={value}
                            depth={0}
                            path={key}
                            defaultExpanded={false}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
