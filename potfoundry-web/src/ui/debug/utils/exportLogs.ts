/**
 * Log export utilities for DevConsole.
 * 
 * @module ui/debug/utils/exportLogs
 */

import { LogMessage } from '../../../infra/logging/types';
import { ProcessedLog } from '../hooks/useConsoleStore';

/**
 * Format timestamp for display.
 */
export function formatTime(ts: number, format: 'absolute' | 'relative' = 'absolute'): string {
    if (format === 'relative') {
        const diff = Date.now() - ts;
        if (diff < 1000) return 'now';
        if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
        if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
        if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
        return `${Math.floor(diff / 86400000)}d ago`;
    }

    const d = new Date(ts);
    return d.toTimeString().split(' ')[0] + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

/**
 * Generate a stable ID for a log message.
 * Uses a counter to ensure uniqueness even for deduplicated logs with same timestamp.
 */
let logIdCounter = 0;
export function generateLogId(log: LogMessage): string {
    logIdCounter++;
    const hash = simpleHash(log.message);
    return `${log.ts}-${log.code}-${hash.slice(0, 6)}-${logIdCounter}`;
}

/**
 * Simple string hash for ID generation.
 */
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
}

/**
 * Download a blob as a file.
 */
function downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Export logs as JSON file.
 */
export function exportLogsAsJSON(logs: LogMessage[]): void {
    const data = logs.map(log => ({
        timestamp: new Date(log.ts).toISOString(),
        level: log.level,
        code: log.code,
        message: log.message,
        context: log.context,
        repeat: log.repeat,
    }));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const filename = `potfoundry-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    downloadBlob(blob, filename);
}

/**
 * Export logs as plain text file.
 */
export function exportLogsAsText(logs: ProcessedLog[]): void {
    const lines = logs.map(log => {
        const time = formatTime(log.ts);
        const count = log.count > 1 ? ` (x${log.count})` : '';
        return `[${time}] [${log.level}] [${log.code}] ${log.message}${count}`;
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const filename = `potfoundry-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    downloadBlob(blob, filename);
}

/**
 * Copy logs to clipboard.
 */
export async function copyLogsToClipboard(logs: ProcessedLog[]): Promise<boolean> {
    const text = logs.map(log => {
        const time = formatTime(log.ts);
        const count = log.count > 1 ? ` (x${log.count})` : '';
        return `[${time}] [${log.level}] ${log.message}${count}`;
    }).join('\n');

    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        return false;
    }
}

/**
 * Highlight search matches in text.
 */
export function highlightText(
    text: string,
    query: string,
    isRegex: boolean
): { parts: { text: string; highlight: boolean }[]; hasMatch: boolean } {
    if (!query) {
        return { parts: [{ text, highlight: false }], hasMatch: false };
    }

    try {
        const regex = isRegex
            ? new RegExp(`(${query})`, 'gi')
            : new RegExp(`(${escapeRegex(query)})`, 'gi');

        const parts: { text: string; highlight: boolean }[] = [];
        let lastIndex = 0;
        let hasMatch = false;
        let match: RegExpExecArray | null;

        while ((match = regex.exec(text)) !== null) {
            hasMatch = true;
            if (match.index > lastIndex) {
                parts.push({ text: text.slice(lastIndex, match.index), highlight: false });
            }
            parts.push({ text: match[1], highlight: true });
            lastIndex = regex.lastIndex;
        }

        if (lastIndex < text.length) {
            parts.push({ text: text.slice(lastIndex), highlight: false });
        }

        return { parts: parts.length > 0 ? parts : [{ text, highlight: false }], hasMatch };
    } catch {
        // Invalid regex
        return { parts: [{ text, highlight: false }], hasMatch: false };
    }
}

/**
 * Escape special regex characters.
 */
function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Test if text matches search query.
 */
export function matchesSearch(text: string, query: string, isRegex: boolean): boolean {
    if (!query) return true;

    try {
        if (isRegex) {
            return new RegExp(query, 'i').test(text);
        }
        return text.toLowerCase().includes(query.toLowerCase());
    } catch {
        return false;
    }
}
