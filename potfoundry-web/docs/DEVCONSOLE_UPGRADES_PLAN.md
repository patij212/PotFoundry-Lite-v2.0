# DevConsole High-Value Upgrades — Implementation Plan

> Created: 2026-03-13  
> Status: **READY FOR EXECUTIONER**  
> Complexity: Medium-High (3-5 sessions estimated)

---

## Overview

Six upgrades to transform DevConsole from a basic debug panel into a comprehensive diagnostic powerhouse:

| # | Feature | Complexity | Dependencies | Priority |
|---|---------|------------|--------------|----------|
| 1 | GPU Diagnostics Tab | Medium | WebGPURenderer access | High |
| 2 | Geometry Inspector | Medium | useGeometry, MeshData | High |
| 3 | Log Virtualization | Low | react-window (new dep) | High |
| 4 | Draggable Float Mode | Low | None | Medium |
| 5 | Timeline View | High | All tabs unified | Low (Phase 2) |
| 6 | Live State Updates | Low | Zustand subscribe | Medium |

**Implementation order**: 3 → 6 → 4 → 1 → 2 → 5

---

# SESSION 1: Log Virtualization + Live State Updates

## Task 1.1: Install react-window

**Command:**
```bash
cd potfoundry-web
npm install react-window @types/react-window
```

**Validation:** `package.json` shows `"react-window": "^1.x.x"` in dependencies

---

## Task 1.2: Create VirtualizedLogList Component

**File:** `src/ui/debug/components/VirtualizedLogList.tsx` (NEW)

```typescript
/**
 * Virtualized log list using react-window.
 * 
 * Renders only visible log rows for performance with 1000s of logs.
 * 
 * @module ui/debug/components/VirtualizedLogList
 */

import React, { useCallback, useRef, useEffect, CSSProperties } from 'react';
import { FixedSizeList, ListChildComponentProps } from 'react-window';
import { ProcessedLog as ProcessedLogType } from '../hooks/useConsoleStore';
import { LogRow } from './LogRow';

/** Height of each log row in pixels - must match .pf-console-row CSS */
const ROW_HEIGHT = 28;

/** Buffer of rows to render outside visible area */
const OVERSCAN_COUNT = 5;

interface VirtualizedLogListProps {
    logs: ProcessedLogType[];
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
    logs: ProcessedLogType[];
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
    const userScrolledUp = useRef(false);

    // Auto-scroll to bottom when new logs arrive (unless user scrolled up)
    useEffect(() => {
        if (logs.length > prevLogCount.current && !userScrolledUp.current) {
            listRef.current?.scrollToItem(logs.length - 1, 'end');
        }
        prevLogCount.current = logs.length;
    }, [logs.length]);

    // Track if user has scrolled up
    const handleScroll = useCallback(({ scrollOffset, scrollUpdateWasRequested }: { 
        scrollOffset: number; 
        scrollUpdateWasRequested: boolean;
    }) => {
        if (!scrollUpdateWasRequested) {
            const maxScroll = (logs.length * ROW_HEIGHT) - height;
            userScrolledUp.current = scrollOffset < maxScroll - ROW_HEIGHT;
        }
    }, [logs.length, height]);

    // Scroll to bottom programmatically
    const scrollToBottom = useCallback(() => {
        userScrolledUp.current = false;
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
            {userScrolledUp.current && (
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
```

---

## Task 1.3: Update LogRow for Virtualization Compatibility

**File:** `src/ui/debug/components/LogRow.tsx`

**Change:** The existing LogRow is already compatible (uses memo, doesn't rely on DOM position).

**One small fix** — add fixed height to ensure consistent row sizing:

**Find in CSS** (`src/ui/debug/ConsoleOverlay.css`):
```css
.pf-console-row {
```

**Add after existing `.pf-console-row` styles:**
```css
/* Virtualization: ensure fixed height for react-window */
.pf-console-row {
    height: 28px;
    box-sizing: border-box;
    overflow: hidden;
}

/* Scroll-to-bottom button for virtualized list */
.pf-console-scroll-bottom {
    position: absolute;
    bottom: 50px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--pf-accent);
    color: white;
    border: none;
    border-radius: 16px;
    padding: 6px 16px;
    font-size: 12px;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

.pf-console-scroll-bottom:hover {
    background: var(--pf-accent-hover);
}

.pf-console-virtualized-wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
}

.pf-console-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--pf-muted);
    font-style: italic;
}
```

---

## Task 1.4: Wire VirtualizedLogList into ConsoleOverlayV2

**File:** `src/ui/debug/ConsoleOverlayV2.tsx`

**Step 1 — Add import:**
```typescript
import { VirtualizedLogList } from './components/VirtualizedLogList';
```

**Step 2 — Add state for container height:**
```typescript
const [logsContainerHeight, setLogsContainerHeight] = useState(300);
const logsContainerRef = useRef<HTMLDivElement>(null);

// Measure logs container height
useEffect(() => {
    const container = logsContainerRef.current;
    if (!container) return;
    
    const observer = new ResizeObserver(entries => {
        for (const entry of entries) {
            setLogsContainerHeight(entry.contentRect.height);
        }
    });
    
    observer.observe(container);
    return () => observer.disconnect();
}, []);
```

**Step 3 — Replace the log list render:**

**FIND:**
```tsx
{/* Log List */}
<div className="pf-console-logs" role="log">
    {unpinnedLogs.map((log, i) => (
        <LogRow
            key={log.id}
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
```

**REPLACE WITH:**
```tsx
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
```

**Step 4 — Remove unused logsEndRef** (no longer needed with virtualization)

---

## Task 1.5: Add Auto-Refresh to StateInspector

**File:** `src/ui/debug/components/StateInspector.tsx`

**Changes to make:**

**Step 1 — Add new imports and state:**
```typescript
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '../../../state';

// Add after existing imports:
/** Debounce utility */
function debounce<T extends (...args: unknown[]) => void>(fn: T, ms: number): T {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    return ((...args: unknown[]) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    }) as T;
}
```

**Step 2 — Update StateInspector component:**

Add these state variables at the top of `StateInspector`:
```typescript
const [autoRefresh, setAutoRefresh] = useState(false);
const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
const [, forceUpdate] = useState(0);
```

**Step 3 — Add subscription effect:**
```typescript
// Auto-refresh on store changes
useEffect(() => {
    if (!autoRefresh) return;
    
    const debouncedRefresh = debounce(() => {
        setLastUpdate(Date.now());
        forceUpdate(n => n + 1);
    }, 100);
    
    const unsub = useAppStore.subscribe(debouncedRefresh);
    return unsub;
}, [autoRefresh]);
```

**Step 4 — Update toolbar to include controls:**

**FIND:**
```tsx
{/* Toolbar */}
<div className="pf-state-toolbar">
    <input
        type="text"
        className="pf-console-search"
        placeholder="Filter slices..."
        value={filter}
        onChange={e => setFilter(e.target.value)}
    />
    <span className="pf-state-count">
        {slices.length} slice{slices.length !== 1 ? 's' : ''}
    </span>
</div>
```

**REPLACE WITH:**
```tsx
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
```

**Step 5 — Add CSS for new controls:**

**File:** `src/ui/debug/ConsoleOverlay.css`

```css
/* State Inspector auto-refresh controls */
.pf-state-auto-refresh {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: var(--pf-muted);
    cursor: pointer;
}

.pf-state-auto-refresh input {
    cursor: pointer;
}

.pf-state-updated {
    font-size: 11px;
    color: var(--pf-muted);
    margin-left: auto;
}
```

---

## Task 1.6: Validation

**Commands:**
```bash
cd potfoundry-web
npm run typecheck
npm run lint
npm test
```

**Manual test:**
1. Open app → Press F12 or `/console`
2. Generate 1000+ logs (e.g., rapid style changes)
3. Verify smooth scrolling, no DOM bloat
4. Verify "↓ New logs" button appears when scrolled up
5. Open State tab, enable Auto-refresh, change a slider, verify tree updates

---

# SESSION 2: Draggable Float Mode

## Task 2.1: Create useDraggable Hook

**File:** `src/ui/debug/hooks/useDraggable.ts` (NEW)

```typescript
/**
 * Hook for making elements draggable.
 * 
 * @module ui/debug/hooks/useDraggable
 */

import { useCallback, useEffect, useRef, useState } from 'react';

interface Position {
    x: number;
    y: number;
}

interface UseDraggableOptions {
    initialPosition: Position;
    onPositionChange: (pos: Position) => void;
    bounds?: 'viewport' | 'none';
    handleSelector?: string;
}

interface UseDraggableReturn {
    position: Position;
    isDragging: boolean;
    dragHandleProps: {
        onMouseDown: (e: React.MouseEvent) => void;
        style: { cursor: string };
    };
}

/**
 * Makes an element draggable within viewport bounds.
 */
export function useDraggable({
    initialPosition,
    onPositionChange,
    bounds = 'viewport',
}: UseDraggableOptions): UseDraggableReturn {
    const [position, setPosition] = useState<Position>(initialPosition);
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef<Position>({ x: 0, y: 0 });

    // Sync with external position changes
    useEffect(() => {
        setPosition(initialPosition);
    }, [initialPosition.x, initialPosition.y]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        // Ignore if clicking on buttons or interactive elements
        const target = e.target as HTMLElement;
        if (target.closest('button, input, select, a')) return;

        e.preventDefault();
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y,
        };
    }, [position.x, position.y]);

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            let newX = e.clientX - dragOffset.current.x;
            let newY = e.clientY - dragOffset.current.y;

            // Constrain to viewport
            if (bounds === 'viewport') {
                const maxX = window.innerWidth - 100; // Keep 100px visible
                const maxY = window.innerHeight - 50;
                newX = Math.max(0, Math.min(newX, maxX));
                newY = Math.max(0, Math.min(newY, maxY));
            }

            setPosition({ x: newX, y: newY });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            onPositionChange(position);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, bounds, onPositionChange, position]);

    // Persist position on mouse up
    useEffect(() => {
        if (!isDragging) {
            onPositionChange(position);
        }
    }, [isDragging, position, onPositionChange]);

    return {
        position,
        isDragging,
        dragHandleProps: {
            onMouseDown: handleMouseDown,
            style: { cursor: isDragging ? 'grabbing' : 'grab' },
        },
    };
}
```

---

## Task 2.2: Wire Dragging into ConsoleOverlayV2

**File:** `src/ui/debug/ConsoleOverlayV2.tsx`

**Step 1 — Add import:**
```typescript
import { useDraggable } from './hooks/useDraggable';
```

**Step 2 — Add hook usage after existing hooks:**
```typescript
const floatPosition = useConsoleStore(s => s.floatPosition);
const setFloatPosition = useConsoleStore(s => s.setFloatPosition);

const { position: dragPosition, isDragging, dragHandleProps } = useDraggable({
    initialPosition: floatPosition,
    onPositionChange: setFloatPosition,
    bounds: 'viewport',
});
```

**Step 3 — Update panel style for float mode:**

**FIND the root div className logic and update:**
```tsx
<div
    ref={panelRef}
    className={`pf-console pf-console--${dockPosition} ${isVisible ? 'pf-console--visible' : ''}`}
    style={{
        ...panelStyle,
        ...(dockPosition === 'float' ? {
            left: dragPosition.x,
            top: dragPosition.y,
        } : {}),
    }}
    // ... rest of props
>
```

**Step 4 — Add drag props to header:**
```tsx
<div 
    className={`pf-console-header ${dockPosition === 'float' ? 'pf-console-header--draggable' : ''}`}
    {...(dockPosition === 'float' ? dragHandleProps : {})}
>
```

---

## Task 2.3: Add Float Mode CSS

**File:** `src/ui/debug/ConsoleOverlay.css`

```css
/* Draggable float mode */
.pf-console--float {
    position: fixed;
    width: 600px;
    height: 400px;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    resize: both;
    overflow: auto;
}

.pf-console-header--draggable {
    cursor: grab;
    user-select: none;
}

.pf-console-header--draggable:active {
    cursor: grabbing;
}

/* Prevent text selection while dragging */
.pf-console--float.pf-console--dragging {
    user-select: none;
}

.pf-console--float.pf-console--dragging * {
    pointer-events: none;
}
```

---

# SESSION 3: GPU Diagnostics Tab

## Task 3.1: Create GPUDiagnostics Service

**File:** `src/ui/debug/utils/GPUDiagnostics.ts` (NEW)

```typescript
/**
 * GPU Diagnostics service for tracking WebGPU resources.
 * 
 * @module ui/debug/utils/GPUDiagnostics
 */

export interface AdapterInfo {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
}

export interface AdapterLimits {
    maxTextureDimension2D: number;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
}

export interface BufferAllocation {
    label: string;
    size: number;
    usage: number;
    createdAt: number;
}

export interface PipelineStats {
    name: string;
    type: 'render' | 'compute';
    compileTimeMs: number;
    createdAt: number;
}

export interface GPUDiagnosticsSnapshot {
    adapter: AdapterInfo | null;
    limits: AdapterLimits | null;
    buffers: BufferAllocation[];
    pipelines: PipelineStats[];
    totalBufferMemory: number;
    isWebGPUAvailable: boolean;
}

type Listener = (snapshot: GPUDiagnosticsSnapshot) => void;

class GPUDiagnosticsService {
    private adapter: AdapterInfo | null = null;
    private limits: AdapterLimits | null = null;
    private buffers: BufferAllocation[] = [];
    private pipelines: PipelineStats[] = [];
    private listeners: Set<Listener> = new Set();
    private isWebGPUAvailable = false;

    /**
     * Initialize with adapter info from WebGPURenderer.
     */
    setAdapterInfo(info: AdapterInfo, limits: AdapterLimits): void {
        this.adapter = info;
        this.limits = limits;
        this.isWebGPUAvailable = true;
        this.notify();
    }

    /**
     * Record a buffer allocation.
     */
    recordBuffer(label: string, size: number, usage: number): void {
        this.buffers.push({
            label,
            size,
            usage,
            createdAt: Date.now(),
        });
        // Keep last 100 allocations to prevent memory bloat
        if (this.buffers.length > 100) {
            this.buffers = this.buffers.slice(-100);
        }
        this.notify();
    }

    /**
     * Record a pipeline compilation.
     */
    recordPipeline(name: string, type: 'render' | 'compute', compileTimeMs: number): void {
        this.pipelines.push({
            name,
            type,
            compileTimeMs,
            createdAt: Date.now(),
        });
        // Keep last 50 pipelines
        if (this.pipelines.length > 50) {
            this.pipelines = this.pipelines.slice(-50);
        }
        this.notify();
    }

    /**
     * Get current diagnostics snapshot.
     */
    getSnapshot(): GPUDiagnosticsSnapshot {
        const totalBufferMemory = this.buffers.reduce((sum, b) => sum + b.size, 0);
        return {
            adapter: this.adapter,
            limits: this.limits,
            buffers: [...this.buffers],
            pipelines: [...this.pipelines],
            totalBufferMemory,
            isWebGPUAvailable: this.isWebGPUAvailable,
        };
    }

    /**
     * Subscribe to diagnostics updates.
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        // Emit current state immediately
        listener(this.getSnapshot());
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        const snapshot = this.getSnapshot();
        this.listeners.forEach(l => l(snapshot));
    }

    /**
     * Clear recorded data (not adapter info).
     */
    clear(): void {
        this.buffers = [];
        this.pipelines = [];
        this.notify();
    }
}

/** Singleton instance */
export const gpuDiagnostics = new GPUDiagnosticsService();
```

---

## Task 3.2: Hook GPUDiagnostics into WebGPURenderer

**File:** `src/renderers/webgpu/WebGPURenderer.ts`

**Step 1 — Add import at top:**
```typescript
import { gpuDiagnostics } from '../../ui/debug/utils/GPUDiagnostics';
```

**Step 2 — After adapter info logging (around line 90-100), emit to service:**

**FIND:**
```typescript
if (info) {
    console.log('[WebGPURenderer] Adapter Info:', {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description
    });
}
```

**ADD AFTER:**
```typescript
// Emit to GPU diagnostics service
gpuDiagnostics.setAdapterInfo(
    {
        vendor: info?.vendor ?? 'Unknown',
        architecture: info?.architecture ?? 'Unknown',
        device: info?.device ?? 'Unknown',
        description: info?.description ?? 'Unknown',
        isFallbackAdapter: (this.adapter as any).isFallbackAdapter ?? false,
    },
    {
        maxTextureDimension2D: this.adapter.limits.maxTextureDimension2D,
        maxBufferSize: this.adapter.limits.maxBufferSize,
        maxStorageBufferBindingSize: this.adapter.limits.maxStorageBufferBindingSize,
        maxComputeWorkgroupStorageSize: this.adapter.limits.maxComputeWorkgroupStorageSize,
    }
);
```

---

## Task 3.3: Create GPUTab Component

**File:** `src/ui/debug/tabs/GPUTab.tsx` (NEW)

```typescript
/**
 * GPU Diagnostics tab for DevConsole.
 * 
 * @module ui/debug/tabs/GPUTab
 */

import React, { useEffect, useState } from 'react';
import { gpuDiagnostics, GPUDiagnosticsSnapshot } from '../utils/GPUDiagnostics';

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * GPU Diagnostics Tab component.
 */
export const GPUTab: React.FC = () => {
    const [snapshot, setSnapshot] = useState<GPUDiagnosticsSnapshot>(
        gpuDiagnostics.getSnapshot()
    );

    useEffect(() => {
        return gpuDiagnostics.subscribe(setSnapshot);
    }, []);

    if (!snapshot.isWebGPUAvailable) {
        return (
            <div className="pf-gpu-tab pf-gpu-tab--unavailable">
                <div className="pf-gpu-unavailable">
                    <span className="pf-gpu-unavailable-icon">⚠️</span>
                    <span>WebGPU not available</span>
                    <span className="pf-gpu-unavailable-hint">
                        Using WebGL fallback renderer
                    </span>
                </div>
            </div>
        );
    }

    const { adapter, limits, buffers, pipelines, totalBufferMemory } = snapshot;

    return (
        <div className="pf-gpu-tab">
            {/* Adapter Info */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">🎮 Adapter</h3>
                <div className="pf-gpu-grid">
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Vendor</span>
                        <span className="pf-gpu-value">{adapter?.vendor ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Architecture</span>
                        <span className="pf-gpu-value">{adapter?.architecture ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Device</span>
                        <span className="pf-gpu-value">{adapter?.device ?? '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Fallback</span>
                        <span className={`pf-gpu-value ${adapter?.isFallbackAdapter ? 'pf-gpu-value--warn' : ''}`}>
                            {adapter?.isFallbackAdapter ? 'Yes ⚠️' : 'No ✓'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Limits */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">📊 Limits</h3>
                <div className="pf-gpu-grid">
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Texture 2D</span>
                        <span className="pf-gpu-value">{limits?.maxTextureDimension2D?.toLocaleString() ?? '-'}px</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Buffer</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxBufferSize) : '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Max Storage Binding</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxStorageBufferBindingSize) : '-'}</span>
                    </div>
                    <div className="pf-gpu-item">
                        <span className="pf-gpu-label">Workgroup Storage</span>
                        <span className="pf-gpu-value">{limits ? formatBytes(limits.maxComputeWorkgroupStorageSize) : '-'}</span>
                    </div>
                </div>
            </div>

            {/* Memory Summary */}
            <div className="pf-gpu-section">
                <h3 className="pf-gpu-section-title">💾 Memory</h3>
                <div className="pf-gpu-memory-summary">
                    <span className="pf-gpu-memory-total">{formatBytes(totalBufferMemory)}</span>
                    <span className="pf-gpu-memory-label">tracked buffer memory</span>
                    <span className="pf-gpu-memory-count">({buffers.length} buffers)</span>
                </div>
            </div>

            {/* Recent Buffers */}
            {buffers.length > 0 && (
                <div className="pf-gpu-section">
                    <h3 className="pf-gpu-section-title">📦 Recent Buffers</h3>
                    <div className="pf-gpu-list">
                        {buffers.slice(-10).reverse().map((b, i) => (
                            <div key={i} className="pf-gpu-list-item">
                                <span className="pf-gpu-buffer-label">{b.label || 'Unnamed'}</span>
                                <span className="pf-gpu-buffer-size">{formatBytes(b.size)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Pipelines */}
            {pipelines.length > 0 && (
                <div className="pf-gpu-section">
                    <h3 className="pf-gpu-section-title">⚡ Pipeline Compiles</h3>
                    <div className="pf-gpu-list">
                        {pipelines.slice(-10).reverse().map((p, i) => (
                            <div key={i} className="pf-gpu-list-item">
                                <span className="pf-gpu-pipeline-name">{p.name}</span>
                                <span className="pf-gpu-pipeline-type">{p.type}</span>
                                <span className={`pf-gpu-pipeline-time ${p.compileTimeMs > 100 ? 'pf-gpu-pipeline-time--slow' : ''}`}>
                                    {p.compileTimeMs.toFixed(1)}ms
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Clear Button */}
            <button 
                className="pf-console-btn pf-gpu-clear"
                onClick={() => gpuDiagnostics.clear()}
            >
                Clear History
            </button>
        </div>
    );
};
```

---

## Task 3.4: Add GPU Tab to Console + CSS

**Step 1 — Update ConsoleTab type in useConsoleStore.ts:**
```typescript
export type ConsoleTab = 'console' | 'health' | 'network' | 'state' | 'gpu';
```

**Step 2 — Update TABS array in ConsoleOverlayV2.tsx:**
```typescript
const TABS: { id: ConsoleTab; label: string; icon: string }[] = [
    { id: 'console', label: 'Console', icon: '📝' },
    { id: 'network', label: 'Network', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' },
    { id: 'state', label: 'State', icon: '🔧' },
    { id: 'gpu', label: 'GPU', icon: '🎮' },
];
```

**Step 3 — Add GPU tab render in ConsoleOverlayV2.tsx:**
```typescript
import { GPUTab } from './tabs/GPUTab';

// In render, after State tab:
{activeTab === 'gpu' && <GPUTab />}
```

**Step 4 — Add CSS in ConsoleOverlay.css:**
```css
/* GPU Tab Styles */
.pf-gpu-tab {
    padding: 12px;
    overflow-y: auto;
}

.pf-gpu-tab--unavailable {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
}

.pf-gpu-unavailable {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    color: var(--pf-muted);
}

.pf-gpu-unavailable-icon {
    font-size: 32px;
}

.pf-gpu-unavailable-hint {
    font-size: 12px;
    opacity: 0.7;
}

.pf-gpu-section {
    margin-bottom: 16px;
}

.pf-gpu-section-title {
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 8px;
    color: var(--pf-text);
}

.pf-gpu-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.pf-gpu-item {
    display: flex;
    flex-direction: column;
    background: var(--pf-surface);
    padding: 8px;
    border-radius: 4px;
}

.pf-gpu-label {
    font-size: 10px;
    color: var(--pf-muted);
    text-transform: uppercase;
}

.pf-gpu-value {
    font-size: 13px;
    font-family: var(--pf-font-mono);
    color: var(--pf-text);
}

.pf-gpu-value--warn {
    color: var(--pf-warn);
}

.pf-gpu-memory-summary {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 12px;
    background: var(--pf-surface);
    border-radius: 4px;
}

.pf-gpu-memory-total {
    font-size: 24px;
    font-weight: 600;
    font-family: var(--pf-font-mono);
    color: var(--pf-accent);
}

.pf-gpu-memory-label {
    font-size: 12px;
    color: var(--pf-muted);
}

.pf-gpu-memory-count {
    font-size: 11px;
    color: var(--pf-muted);
}

.pf-gpu-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 200px;
    overflow-y: auto;
}

.pf-gpu-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: var(--pf-surface);
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--pf-font-mono);
}

.pf-gpu-buffer-label,
.pf-gpu-pipeline-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pf-gpu-buffer-size {
    color: var(--pf-accent);
}

.pf-gpu-pipeline-type {
    font-size: 10px;
    padding: 2px 6px;
    background: var(--pf-surface-alt);
    border-radius: 4px;
    color: var(--pf-muted);
}

.pf-gpu-pipeline-time {
    color: var(--pf-success);
}

.pf-gpu-pipeline-time--slow {
    color: var(--pf-warn);
}

.pf-gpu-clear {
    margin-top: 12px;
}
```

---

# SESSION 4: Geometry Inspector

## Task 4.1: Create GeometryInspector Service

**File:** `src/ui/debug/utils/GeometryInspector.ts` (NEW)

```typescript
/**
 * Geometry inspection service for DevConsole.
 * 
 * @module ui/debug/utils/GeometryInspector
 */

export interface PreviewStats {
    vertexCount: number;
    triangleCount: number;
    drawCalls: number;
}

export interface ExportStats {
    vertexCount: number;
    triangleCount: number;
    isManifold: boolean;
    isWatertight: boolean;
    chainCount: number;
    surfaces: string[];
    exportTimeMs: number;
}

export interface GeometrySnapshot {
    preview: PreviewStats | null;
    lastExport: ExportStats | null;
    lastUpdateTime: number;
}

type Listener = (snapshot: GeometrySnapshot) => void;

class GeometryInspectorService {
    private preview: PreviewStats | null = null;
    private lastExport: ExportStats | null = null;
    private listeners: Set<Listener> = new Set();

    /**
     * Update preview stats (called from render loop).
     */
    updatePreview(stats: PreviewStats): void {
        this.preview = stats;
        this.notify();
    }

    /**
     * Record export completion.
     */
    recordExport(stats: ExportStats): void {
        this.lastExport = stats;
        this.notify();
    }

    /**
     * Get current snapshot.
     */
    getSnapshot(): GeometrySnapshot {
        return {
            preview: this.preview,
            lastExport: this.lastExport,
            lastUpdateTime: Date.now(),
        };
    }

    /**
     * Subscribe to updates.
     */
    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        listener(this.getSnapshot());
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        const snapshot = this.getSnapshot();
        this.listeners.forEach(l => l(snapshot));
    }
}

export const geometryInspector = new GeometryInspectorService();
```

---

## Task 4.2: Create GeometryTab Component

**File:** `src/ui/debug/tabs/GeometryTab.tsx` (NEW)

```typescript
/**
 * Geometry Inspector tab for DevConsole.
 * 
 * @module ui/debug/tabs/GeometryTab
 */

import React, { useEffect, useState } from 'react';
import { geometryInspector, GeometrySnapshot } from '../utils/GeometryInspector';

/**
 * Geometry Tab component.
 */
export const GeometryTab: React.FC = () => {
    const [snapshot, setSnapshot] = useState<GeometrySnapshot>(
        geometryInspector.getSnapshot()
    );

    useEffect(() => {
        return geometryInspector.subscribe(setSnapshot);
    }, []);

    const { preview, lastExport } = snapshot;

    return (
        <div className="pf-geometry-tab">
            {/* Preview Stats */}
            <div className="pf-geometry-section">
                <h3 className="pf-geometry-section-title">🎨 Preview Mesh</h3>
                {preview ? (
                    <div className="pf-gpu-grid">
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Vertices</span>
                            <span className="pf-gpu-value">{preview.vertexCount.toLocaleString()}</span>
                        </div>
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Triangles</span>
                            <span className="pf-gpu-value">{preview.triangleCount.toLocaleString()}</span>
                        </div>
                        <div className="pf-gpu-item">
                            <span className="pf-gpu-label">Draw Calls</span>
                            <span className="pf-gpu-value">{preview.drawCalls}</span>
                        </div>
                    </div>
                ) : (
                    <div className="pf-geometry-empty">No preview data available</div>
                )}
            </div>

            {/* Export Stats */}
            <div className="pf-geometry-section">
                <h3 className="pf-geometry-section-title">📦 Last Export</h3>
                {lastExport ? (
                    <>
                        <div className="pf-gpu-grid">
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Vertices</span>
                                <span className="pf-gpu-value">{lastExport.vertexCount.toLocaleString()}</span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Triangles</span>
                                <span className="pf-gpu-value">{lastExport.triangleCount.toLocaleString()}</span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Manifold</span>
                                <span className={`pf-gpu-value ${lastExport.isManifold ? 'pf-geometry-ok' : 'pf-geometry-warn'}`}>
                                    {lastExport.isManifold ? '✓ Yes' : '⚠️ No'}
                                </span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Watertight</span>
                                <span className={`pf-gpu-value ${lastExport.isWatertight ? 'pf-geometry-ok' : 'pf-geometry-warn'}`}>
                                    {lastExport.isWatertight ? '✓ Yes' : '⚠️ No'}
                                </span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Feature Chains</span>
                                <span className="pf-gpu-value">{lastExport.chainCount}</span>
                            </div>
                            <div className="pf-gpu-item">
                                <span className="pf-gpu-label">Export Time</span>
                                <span className="pf-gpu-value">{lastExport.exportTimeMs.toFixed(0)}ms</span>
                            </div>
                        </div>
                        <div className="pf-geometry-surfaces">
                            <span className="pf-gpu-label">Surfaces:</span>
                            {lastExport.surfaces.map(s => (
                                <span key={s} className="pf-geometry-surface-badge">{s}</span>
                            ))}
                        </div>
                    </>
                ) : (
                    <div className="pf-geometry-empty">Export a mesh to see stats</div>
                )}
            </div>
        </div>
    );
};
```

---

## Task 4.3: Register Geometry Tab

Same pattern as GPU tab:
1. Add `'geometry'` to `ConsoleTab` union
2. Add to TABS array: `{ id: 'geometry', label: 'Geometry', icon: '📐' }`
3. Add render: `{activeTab === 'geometry' && <GeometryTab />}`
4. Add CSS for `.pf-geometry-*` classes

---

# SESSION 5: Timeline View (Phase 2)

**Deferred** — This is the most complex upgrade. Implement after Sessions 1-4 are stable and battle-tested.

Key considerations:
- Canvas-based rendering for 10k+ events
- Shared timeline state across all event types
- Zoom/pan with momentum scrolling
- Event correlation heuristics

---

# Validation Checklist (All Sessions)

After each session:
```bash
npm run typecheck   # Must pass
npm run lint        # 0 warnings
npm test            # All passing
```

Manual testing:
- [ ] Console tab virtualization works with 1000+ logs
- [ ] State tab auto-refresh toggles correctly
- [ ] Float mode is draggable
- [ ] GPU tab shows adapter info
- [ ] Geometry tab shows export stats after STL export

---

## 1. GPU Diagnostics Tab

**Goal**: Surface WebGPU adapter info, buffer memory usage, and pipeline compile times in a dedicated tab.

### Data Sources

```typescript
// WebGPURenderer.ts:80-101 already logs this at init
interface GPUDiagnostics {
  adapter: {
    vendor: string;
    architecture: string;
    device: string;
    description: string;
    isFallbackAdapter: boolean;
  };
  limits: {
    maxTextureDimension2D: number;
    maxBufferSize: number;
    maxStorageBufferBindingSize: number;
    maxComputeWorkgroupStorageSize: number;
  };
  buffers: BufferAllocation[];  // label, size, usage
  pipelines: PipelineStats[];   // name, compileTime
  memoryEstimate: number;       // sum of buffer sizes
}
```

### Implementation Steps

1. **Create GPU diagnostic service** (`src/ui/debug/utils/GPUDiagnostics.ts`)
   - Singleton that hooks into WebGPURenderer
   - Track buffer creations via monkey-patching `device.createBuffer`
   - Track pipeline compile times via `device.createComputePipeline` / `createRenderPipeline`
   - Store adapter info captured at init

2. **Add store slice** (extend `useConsoleStore`)
   ```typescript
   gpuDiagnostics: GPUDiagnostics | null;
   setGPUDiagnostics: (d: GPUDiagnostics) => void;
   ```

3. **Create GPUTab component** (`src/ui/debug/tabs/GPUTab.tsx`)
   - Adapter info card (vendor, arch, fallback status)
   - Limits table
   - Buffer list with sizes (sortable by size)
   - Pipeline compile time histogram
   - Total memory estimate badge

4. **Wire into ConsoleOverlayV2**
   - Add tab: `{ id: 'gpu', label: 'GPU', icon: '🎮' }`
   - Render `<GPUTab />` when active

### Challenges
- `device.createBuffer` tracking needs WeakRef to avoid memory leaks
- Pipeline compile timing requires wrapping async calls
- Adapter info is only available after init — handle null state gracefully

### Files to Create/Modify
- `src/ui/debug/utils/GPUDiagnostics.ts` (new)
- `src/ui/debug/tabs/GPUTab.tsx` (new)
- `src/ui/debug/hooks/useConsoleStore.ts` (add slice)
- `src/ui/debug/ConsoleOverlayV2.tsx` (add tab)
- `src/renderers/webgpu/WebGPURenderer.ts` (emit diagnostics)

---

## 2. Geometry Inspector

**Goal**: Display current mesh vertex/face counts, manifold status, and provide quick export actions.

### Data Sources

```typescript
// From useGeometry() and latest export result
interface GeometryInspection {
  preview: {
    vertexCount: number;
    triangleCount: number;
    drawCalls: number;
  };
  export: {
    vertexCount: number;
    triangleCount: number;
    isManifold: boolean;
    isWatertight: boolean;
    chains: number;        // feature chain count
    surfaces: string[];    // ["outer_wall", "inner_wall", "base", "rim"]
  } | null;
  lastExportTime: number;  // ms
}
```

### Implementation Steps

1. **Create geometry inspection service** (`src/ui/debug/utils/GeometryInspector.ts`)
   - Subscribe to geometry store for preview stats
   - Listen for export completions to capture mesh metadata
   - Compute manifold/watertight status from MeshData.featureGraph

2. **Add store slice** (extend `useConsoleStore`)
   ```typescript
   geometryStats: GeometryInspection | null;
   setGeometryStats: (s: GeometryInspection) => void;
   ```

3. **Create GeometryTab component** (`src/ui/debug/tabs/GeometryTab.tsx`)
   - Preview stats card (verts/tris from live render)
   - Export result card (appears after export)
   - Manifold/watertight status badges (✅/❌)
   - Surface breakdown table
   - Quick actions: "Export STL", "Export 3MF", "Copy Mesh Stats"

4. **Wire into ConsoleOverlayV2**
   - Add tab: `{ id: 'geometry', label: 'Geometry', icon: '📐' }`

### Challenges
- Manifold detection requires edge analysis — may be expensive, cache result
- Preview stats must not cause re-renders on every frame
- Export stats only available after user triggers export

### Files to Create/Modify
- `src/ui/debug/utils/GeometryInspector.ts` (new)
- `src/ui/debug/tabs/GeometryTab.tsx` (new)
- `src/ui/debug/hooks/useConsoleStore.ts` (add slice)
- `src/ui/debug/ConsoleOverlayV2.tsx` (add tab)

---

## 3. Log Virtualization

**Goal**: Handle 1000s of logs without DOM bloat using react-window.

### Implementation Steps

1. **Add dependency**
   ```bash
   npm install react-window @types/react-window
   ```

2. **Create VirtualizedLogList component** (`src/ui/debug/components/VirtualizedLogList.tsx`)
   ```typescript
   import { FixedSizeList } from 'react-window';
   
   interface Props {
     logs: ProcessedLog[];
     search: string;
     isRegex: boolean;
     // ... other props passed to LogRow
   }
   
   export function VirtualizedLogList({ logs, ...props }: Props) {
     const ROW_HEIGHT = 24; // Match existing .pf-log-row height
     
     return (
       <FixedSizeList
         height={containerHeight}
         width="100%"
         itemCount={logs.length}
         itemSize={ROW_HEIGHT}
         itemData={{ logs, ...props }}
       >
         {LogRowRenderer}
       </FixedSizeList>
     );
   }
   ```

3. **Adapt LogRow for virtualization**
   - Accept style prop for positioning
   - Memoize with React.memo
   - Handle variable height logs (expanded state) — may need VariableSizeList

4. **Replace log list in ConsoleOverlayV2**
   ```diff
   - {unpinnedLogs.map((log, i) => <LogRow ... />)}
   + <VirtualizedLogList logs={unpinnedLogs} ... />
   ```

5. **Handle auto-scroll**
   - Use `FixedSizeList` ref to scroll to bottom on new logs
   - Implement "scroll lock" when user scrolls up

### Challenges
- LogRow expanded state changes height — need VariableSizeList or collapse expanded logs
- Keyboard navigation (up/down arrows) needs list ref integration
- Pinned logs section stays non-virtualized (usually small)

### Files to Create/Modify
- `package.json` (add react-window)
- `src/ui/debug/components/VirtualizedLogList.tsx` (new)
- `src/ui/debug/components/LogRow.tsx` (adapt for virtualization)
- `src/ui/debug/ConsoleOverlayV2.tsx` (use VirtualizedLogList)

### Size Estimate
- react-window: ~6KB gzipped
- Implementation: ~100 lines

---

## 4. Draggable Float Mode

**Goal**: Make the floating panel mouse-draggable with position persistence.

### Current State
- `dockPosition: 'float'` already exists in store
- `floatPosition: { x: number; y: number }` is persisted
- CSS class `.pf-console--float` positions via `top/left` but not draggable

### Implementation Steps

1. **Create useDraggable hook** (`src/ui/debug/hooks/useDraggable.ts`)
   ```typescript
   export function useDraggable(
     ref: RefObject<HTMLElement>,
     initialPos: { x: number; y: number },
     onPositionChange: (pos: { x: number; y: number }) => void
   ) {
     const [isDragging, setIsDragging] = useState(false);
     const [offset, setOffset] = useState({ x: 0, y: 0 });
     
     // Mouse down on header → start drag
     // Mouse move → update position
     // Mouse up → end drag, persist position
     // Constrain to viewport bounds
   }
   ```

2. **Add drag handle to header**
   ```tsx
   <div 
     className="pf-console-header"
     onMouseDown={dockPosition === 'float' ? startDrag : undefined}
     style={{ cursor: dockPosition === 'float' ? 'move' : 'default' }}
   >
   ```

3. **Apply position in float mode**
   ```tsx
   style={dockPosition === 'float' ? {
     position: 'fixed',
     left: floatPosition.x,
     top: floatPosition.y,
   } : undefined}
   ```

4. **Add resize handles for float mode**
   - Corner resize handle (bottom-right)
   - Persist width/height to store

### Challenges
- Prevent drag when clicking buttons in header
- Handle window resize (keep panel in viewport)
- Touch support for mobile

### Files to Create/Modify
- `src/ui/debug/hooks/useDraggable.ts` (new)
- `src/ui/debug/ConsoleOverlayV2.tsx` (wire up dragging)
- `src/ui/debug/ConsoleOverlay.css` (cursor styles)

---

## 5. Timeline View

**Goal**: Horizontal timeline correlating logs, network requests, and performance events.

### Design

```
Time →  0s        1s        2s        3s        4s
        |---------|---------|---------|---------|
Logs    ●  ● ●      ●●●        ●           ●●
Network   ▬▬▬▬▬    ▬▬   ▬▬▬▬▬▬▬▬▬
Perf    ▲60fps    ▲58fps  ▲30fps▼    ▲60fps
        
Click any event to see details panel below
```

### Data Model

```typescript
interface TimelineEvent {
  id: string;
  type: 'log' | 'network' | 'perf';
  timestamp: number;
  endTime?: number;  // for network requests
  data: LogMessage | NetworkEntry | PerformanceSample;
}

interface TimelineState {
  events: TimelineEvent[];
  viewStart: number;   // timestamp
  viewEnd: number;     // timestamp
  selectedId: string | null;
  lanes: ('log' | 'network' | 'perf')[];
}
```

### Implementation Steps

1. **Create TimelineTab component** (`src/ui/debug/tabs/TimelineTab.tsx`)
   - Canvas or SVG-based rendering for performance
   - Three lanes: logs (dots), network (bars), perf (line graph)
   - Horizontal scroll/zoom with mouse wheel
   - Click to select, show details below

2. **Unify timestamps**
   - All events already have timestamps
   - Normalize to session start time for display

3. **Time range selection**
   - Brush selection to zoom
   - "Last 30s / 1m / 5m / All" quick filters

4. **Event correlation**
   - Show vertical dashed lines connecting related events
   - Example: network request → response → log entry

### Challenges
- Canvas rendering for 1000s of events efficiently
- Zoom/pan UX at different scales
- Correlating events requires heuristics (same request ID, timing proximity)

### Files to Create/Modify
- `src/ui/debug/tabs/TimelineTab.tsx` (new)
- `src/ui/debug/hooks/useConsoleStore.ts` (timeline state)
- `src/ui/debug/ConsoleOverlayV2.tsx` (add tab)
- `src/ui/debug/ConsoleOverlay.css` (timeline styles)

### Complexity Note
This is the most complex upgrade — consider implementing as Phase 2 after other features are stable.

---

## 6. Live State Updates

**Goal**: Auto-refresh State tab when Zustand stores change.

### Current State
- `StateInspector.tsx` shows a snapshot of store state
- No auto-refresh — user must switch tabs or re-open console

### Implementation Steps

1. **Create state subscription hook** (`src/ui/debug/hooks/useStoreSubscription.ts`)
   ```typescript
   export function useStoreSubscription(
     store: StoreApi<unknown>,
     onUpdate: () => void,
     debounceMs = 100
   ) {
     useEffect(() => {
       const unsub = store.subscribe(
         debounce(onUpdate, debounceMs)
       );
       return unsub;
     }, [store, onUpdate, debounceMs]);
   }
   ```

2. **Add refresh controls to StateInspector**
   - Toggle: "Auto-refresh" checkbox (default: off to avoid perf impact)
   - Manual: "Refresh" button
   - Indicator: "Last updated: 2s ago"

3. **Subscribe to relevant stores**
   ```typescript
   const stores = [useAppStore, useConsoleStore, useGeometry];
   
   if (autoRefresh) {
     stores.forEach(store => 
       useStoreSubscription(store, () => setSnapshot(getSnapshot()))
     );
   }
   ```

4. **Diff highlighting**
   - Compare new snapshot to previous
   - Highlight changed values with yellow background (fades after 2s)

### Challenges
- Serializing large store state can be expensive
- Need to handle circular references in state
- Debounce to prevent thrashing on rapid updates

### Files to Create/Modify
- `src/ui/debug/hooks/useStoreSubscription.ts` (new)
- `src/ui/debug/components/StateInspector.tsx` (add auto-refresh)
- `src/ui/debug/ConsoleOverlay.css` (diff highlight styles)

---

## Implementation Schedule

### Session 1: Foundation (Log Virtualization + Live State)
1. Install react-window
2. Implement VirtualizedLogList
3. Test with 10,000 logs
4. Add auto-refresh to StateInspector

### Session 2: Float Mode + GPU Tab Setup
1. Implement useDraggable hook
2. Wire up float mode dragging
3. Create GPUDiagnostics service skeleton
4. Create GPUTab UI shell

### Session 3: GPU Diagnostics Complete
1. Hook into WebGPURenderer
2. Track buffer allocations
3. Track pipeline compile times
4. Polish GPU tab UI

### Session 4: Geometry Inspector
1. Create GeometryInspector service
2. Wire to geometry store
3. Implement manifold detection
4. Create GeometryTab UI

### Session 5: Timeline View (Optional)
1. Design canvas renderer
2. Implement pan/zoom
3. Event correlation logic
4. Polish and testing

---

## Testing Strategy

### Unit Tests
- `VirtualizedLogList.test.tsx` — render 10,000 items, scroll behavior
- `useDraggable.test.ts` — drag boundaries, persistence
- `GPUDiagnostics.test.ts` — mock device.createBuffer interception

### E2E Tests
- Open DevConsole, switch to GPU tab, verify adapter info displayed
- Generate 5000 logs, verify scroll performance
- Drag float panel, reload, verify position persisted

### Manual Testing
- Mobile: verify no dragging (touch-scroll instead)
- WebGL fallback: GPU tab shows "WebGPU not available" gracefully
- Export: Geometry tab updates after STL export

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| react-window bundle size | Low | Only 6KB gzipped |
| GPU tracking memory leaks | Medium | Use WeakRef for buffer tracking |
| Timeline perf with 10k events | High | Canvas rendering, viewport culling |
| StateInspector circular refs | Medium | Use safe JSON serializer |

---

## Open Questions

1. **GPU Tab scope**: Should we also show shader compilation errors from WGSL?
2. **Geometry inspector scope**: Include UV seam visualization?
3. **Timeline correlation**: How to link network requests to specific components?
4. **Float mode on mobile**: Disable dragging, use tap-to-reposition instead?

---

## Appendix: Current Tab Structure

```typescript
// ConsoleOverlayV2.tsx:34-41
const TABS: { id: ConsoleTab; label: string; icon: string }[] = [
    { id: 'console', label: 'Console', icon: '📋' },
    { id: 'network', label: 'Network', icon: '🌐' },
    { id: 'health', label: 'Health', icon: '💓' },
    { id: 'state', label: 'State', icon: '🔧' },
    // New tabs will be added here:
    // { id: 'gpu', label: 'GPU', icon: '🎮' },
    // { id: 'geometry', label: 'Geometry', icon: '📐' },
    // { id: 'timeline', label: 'Timeline', icon: '📊' },
];
```
