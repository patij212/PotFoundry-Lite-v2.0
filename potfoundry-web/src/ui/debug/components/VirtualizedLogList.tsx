/**
 * Virtualized log list using react-window.
 * 
 * Renders only visible log rows for performance with 1000s of logs.
 * 
 * @module ui/debug/components/VirtualizedLogList
 */

import React, { useCallback, useRef, useEffect, useState } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { ProcessedLog } from '../hooks/useConsoleStore';
import { LogRow } from './LogRow';

/** Height of each log row in pixels - must match .pf-console-row CSS */
const ROW_HEIGHT = 28;

/** Buffer of rows to render outside visible area */
const OVERSCAN_COUNT = 5;

interface VirtualizedLogListProps {
    logs: ProcessedLog[];
    search: string;
    isRegex: boolean;
    timestampFormat: 'absolute' | 'relative';
    pinnedIds: Set<string>;
    bookmarkedIds: Set<string>;
    selectedIndex: number | null;
    onSelect: (index: number | null) => void;
    onPin: (id: string) => void;
    onBookmark: (id: string) => void;
    height: number;
}

interface ItemData {
    logs: ProcessedLog[];
    search: string;
    isRegex: boolean;
    timestampFormat: 'absolute' | 'relative';
    pinnedIds: Set<string>;
    bookmarkedIds: Set<string>;
    selectedIndex: number | null;
    onSelect: (index: number | null) => void;
    onPin: (id: string) => void;
    onBookmark: (id: string) => void;
}

/**
 * Row renderer for react-window.
 */
const LogRowRenderer: React.FC<ListChildComponentProps<ItemData>> = ({ index, style, data }) => {
    const { 
        logs, search, isRegex, timestampFormat, 
        pinnedIds, bookmarkedIds, selectedIndex, 
        onSelect, onPin, onBookmark 
    } = data;
    
    const log = logs[index];
    
    return (
        <div style={style}>
            <LogRow
                log={log}
                search={search}
                isRegex={isRegex}
                timestampFormat={timestampFormat}
                isPinned={pinnedIds.has(log.id)}
                isBookmarked={bookmarkedIds.has(log.id)}
                isSelected={selectedIndex === index}
                onClick={() => onSelect(index === selectedIndex ? null : index)}
                onPin={onPin}
                onBookmark={onBookmark}
            />
        </div>
    );
};

/**
 * Virtualized log list component.
 */
export const VirtualizedLogList: React.FC<VirtualizedLogListProps> = ({
    logs,
    search,
    isRegex,
    timestampFormat,
    pinnedIds,
    bookmarkedIds,
    selectedIndex,
    onSelect,
    onPin,
    onBookmark,
    height,
}) => {
    const listRef = useRef<FixedSizeList>(null);
    const prevLogCount = useRef(logs.length);
    const [userScrolledUp, setUserScrolledUp] = useState(false);

    // Auto-scroll to bottom when new logs arrive (unless user scrolled up)
    useEffect(() => {
        if (logs.length > prevLogCount.current && !userScrolledUp) {
            listRef.current?.scrollToItem(logs.length - 1, 'end');
        }
        prevLogCount.current = logs.length;
    }, [logs.length, userScrolledUp]);

    // Track if user has scrolled up
    const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { 
        scrollOffset: number; 
        scrollUpdateWasRequested: boolean;
    }) => {
        if (!scrollUpdateWasRequested) {
            const maxScroll = Math.max(0, (logs.length * ROW_HEIGHT) - height);
            const isAtBottom = scrollOffset >= maxScroll - ROW_HEIGHT;
            setUserScrolledUp(!isAtBottom);
        }
    }, [logs.length, height]);

    // Scroll to bottom programmatically
    const scrollToBottom = useCallback(() => {
        setUserScrolledUp(false);
        listRef.current?.scrollToItem(logs.length - 1, 'end');
    }, [logs.length]);

    const itemData: ItemData = {
        logs,
        search,
        isRegex,
        timestampFormat,
        pinnedIds,
        bookmarkedIds,
        selectedIndex,
        onSelect,
        onPin,
        onBookmark,
    };

    if (logs.length === 0) {
        return (
            <div className="pf-console-empty" style={{ height }}>
                No logs to display
            </div>
        );
    }

    return (
        <div className="pf-console-virtualized-wrapper">
            <FixedSizeList
                ref={listRef}
                height={height}
                width="100%"
                itemCount={logs.length}
                itemSize={ROW_HEIGHT}
                itemData={itemData}
                overscanCount={OVERSCAN_COUNT}
                onScroll={handleScroll}
            >
                {LogRowRenderer}
            </FixedSizeList>
            {userScrolledUp && logs.length > 0 && (
                <button 
                    className="pf-console-scroll-bottom"
                    onClick={scrollToBottom}
                    title="Scroll to bottom"
                >
                    ↓ New logs
                </button>
            )}
        </div>
    );
};
