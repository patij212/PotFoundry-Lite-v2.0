/**
 * Individual log row component.
 * 
 * Renders a single log entry with level badge, timestamp, message,
 * and optional context details.
 * 
 * @module ui/debug/components/LogRow
 */

import React, { memo } from 'react';
import { LogMessage, LogLevel } from '../../../infra/logging/types';
import { formatTime, highlightText } from '../utils/exportLogs';

const LEVEL_ICONS: Record<LogLevel, string> = {
    DEBUG: '🔍',
    INFO: 'ℹ️',
    WARN: '⚠️',
    ERROR: '❌',
    CRITICAL: '🔴',
};

interface LogRowProps {
    log: LogMessage & { count: number; id: string };
    search?: string;
    isRegex?: boolean;
    timestampFormat?: 'absolute' | 'relative';
    isPinned?: boolean;
    isBookmarked?: boolean;
    isSelected?: boolean;
    isNew?: boolean;
    onPin?: (id: string) => void;
    onBookmark?: (id: string) => void;
    onClick?: () => void;
}

export const LogRow: React.FC<LogRowProps> = memo(({
    log,
    search = '',
    isRegex = false,
    timestampFormat = 'absolute',
    isPinned = false,
    isBookmarked = false,
    isSelected = false,
    isNew = false,
    onPin,
    onBookmark,
    onClick,
}) => {
    const levelClass = log.level.toLowerCase();
    const hasContext = log.context && Object.keys(log.context).length > 0;

    // Highlight search matches
    const { parts: messageParts } = highlightText(log.message, search, isRegex);

    return (
        <div
            className={`pf-console-row pf-console-row--${levelClass} ${isSelected ? 'pf-console-row--selected' : ''} ${isNew ? 'pf-console-row--new' : ''}`}
            onClick={onClick}
            role="listitem"
            aria-selected={isSelected}
        >
            {/* Timestamp */}
            <span className="pf-console-ts" aria-label="Timestamp">
                {formatTime(log.ts, timestampFormat)}
            </span>

            {/* Level Badge */}
            <span className="pf-console-level" aria-label={`Log level: ${log.level}`}>
                <span className="pf-console-level-icon">{LEVEL_ICONS[log.level]}</span>
                <span className="pf-console-level-text">{log.level}</span>
            </span>

            {/* Message Content */}
            <div className="pf-console-msg-wrapper">
                <span className="pf-console-msg">
                    {messageParts.map((part, i) =>
                        part.highlight ? (
                            <mark key={i} className="pf-search-match">{part.text}</mark>
                        ) : (
                            <span key={i}>{part.text}</span>
                        )
                    )}
                </span>

                {/* Repeat Count Badge */}
                {log.count > 1 && (
                    <span className="pf-console-count" aria-label={`Repeated ${log.count} times`}>
                        x{log.count.toLocaleString()}
                    </span>
                )}

                {/* Context Details (Collapsible) */}
                {hasContext && (
                    <details className="pf-console-context-details">
                        <summary>▶ Details</summary>
                        <pre className="pf-console-context">
                            {JSON.stringify(log.context, null, 2)}
                        </pre>
                    </details>
                )}
            </div>

            {/* Action Buttons (visible on hover) */}
            <div className="pf-console-row-actions">
                {onPin && (
                    <button
                        className={`pf-console-action-btn ${isPinned ? 'pf-console-action-btn--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onPin(log.id); }}
                        title={isPinned ? 'Unpin' : 'Pin to top'}
                        aria-label={isPinned ? 'Unpin log' : 'Pin log to top'}
                    >
                        📌
                    </button>
                )}
                {onBookmark && (
                    <button
                        className={`pf-console-action-btn ${isBookmarked ? 'pf-console-action-btn--active' : ''}`}
                        onClick={(e) => { e.stopPropagation(); onBookmark(log.id); }}
                        title={isBookmarked ? 'Remove bookmark' : 'Bookmark'}
                        aria-label={isBookmarked ? 'Remove bookmark' : 'Bookmark log'}
                    >
                        🔖
                    </button>
                )}
            </div>
        </div>
    );
});

LogRow.displayName = 'LogRow';
