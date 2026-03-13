/**
 * Command registry and executor for DevConsole.
 * 
 * Provides slash commands like /clear, /state, /camera, /perf, /export.
 * 
 * @module ui/debug/utils/CommandRegistry
 */

import manager from '../../../infra/logging/MessageManager';

type CommandHandler = (args: string[]) => void | Promise<void>;

interface CommandDef {
    handler: CommandHandler;
    help: string;
    usage?: string;
}

const commands: Record<string, CommandDef> = {};

/**
 * Register a slash command.
 */
export function registerCommand(
    name: string,
    handler: CommandHandler,
    help: string,
    usage?: string
): void {
    const normalizedName = name.startsWith('/') ? name : `/${name}`;
    commands[normalizedName] = { handler, help, usage };
}

/**
 * Execute a command string.
 * Returns true if command was found and executed.
 */
export async function executeCommand(input: string): Promise<boolean> {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) {
        return false;
    }

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    const def = commands[cmd];
    if (!def) {
        manager.warn('CMD', `Unknown command: ${cmd}. Type /help for available commands.`);
        return true; // Command was attempted
    }

    try {
        await def.handler(args);
    } catch (err) {
        manager.error('CMD', `Command failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    return true;
}

/**
 * Get all registered commands.
 */
export function getCommands(): Record<string, { help: string; usage?: string }> {
    const result: Record<string, { help: string; usage?: string }> = {};
    for (const [name, def] of Object.entries(commands)) {
        result[name] = { help: def.help, usage: def.usage };
    }
    return result;
}

// ============================================================================
// Built-in Commands
// ============================================================================

// /help
registerCommand('help', () => {
    const cmds = getCommands();
    const lines = Object.entries(cmds)
        .map(([name, { help, usage }]) => `${name}${usage ? ` ${usage}` : ''} - ${help}`)
        .join('\n');
    manager.info('HELP', `Available commands:\n${lines}`);
}, 'Show available commands');

// /clear - Clear all console logs
registerCommand('clear', () => {
    try {
        const { useConsoleStore } = require('../hooks/useConsoleStore');
        useConsoleStore.getState().clearLogs();
        manager.info('CMD', 'Logs cleared');
    } catch {
        manager.warn('CMD', 'Failed to clear logs');
    }
}, 'Clear all logs');

// /ping
registerCommand('ping', () => {
    manager.info('SYS', 'Pong!');
}, 'Test console responsiveness');

// /state - Will dump Zustand store
registerCommand('state', (args) => {
    try {
        // Dynamic import to avoid circular dependencies
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Debug-only global; typed in global.d.ts as __POTFOUNDRY_STORE__ but debug console uses __PF_STORE__
        const storeModule = (window as any).__PF_STORE__;
        if (!storeModule) {
            manager.warn('STATE', 'Store not available. Make sure app is initialized.');
            return;
        }

        const slice = args[0];
        const state = storeModule.getState();

        if (slice && state[slice]) {
            manager.info('STATE', `${slice}:`, { [slice]: state[slice] });
        } else if (slice) {
            manager.warn('STATE', `Unknown slice: ${slice}. Available: ${Object.keys(state).join(', ')}`);
        } else {
            manager.info('STATE', 'Full store state:', state);
        }
    } catch (err) {
        manager.error('STATE', `Failed to get state: ${err}`);
    }
}, 'Dump Zustand store state', '[slice]');

// /camera - Will dump camera state
registerCommand('camera', () => {
    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Debug-only global for camera controller access
        const controller = (window as any).__PF_CONTROLLER__;
        if (!controller) {
            manager.warn('CAMERA', 'Controller not available.');
            return;
        }

        const cameraState = controller.cameraState;
        if (cameraState) {
            manager.info('CAMERA', 'Camera state:', cameraState);
        } else {
            manager.warn('CAMERA', 'No camera state available.');
        }
    } catch (err) {
        manager.error('CAMERA', `Failed to get camera state: ${err}`);
    }
}, 'Show camera position and settings');

// /perf - Performance metrics
registerCommand('perf', () => {
    const stats = manager.getLastHeartbeatStats();
    if (stats) {
        manager.info('PERF', 'Performance metrics:', {
            windowMs: stats.windowMs,
            fps: stats.frames ? (stats.frames / (stats.windowMs / 1000)).toFixed(1) : 'N/A',
            draws: stats.draws ?? 0,
            verts: stats.verts ?? 0,
            logCounts: stats.counts,
        });
    } else {
        manager.warn('PERF', 'No performance data available yet.');
    }
}, 'Show performance metrics');

// /theme
registerCommand('theme', (args) => {
    const theme = args[0]?.toLowerCase();
    if (theme !== 'dark' && theme !== 'light') {
        manager.warn('THEME', 'Usage: /theme dark|light');
        return;
    }
    try {
        const { useConsoleStore } = require('../hooks/useConsoleStore');
        useConsoleStore.getState().setTheme(theme as 'dark' | 'light');
        manager.info('THEME', `Theme changed to: ${theme}`);
    } catch {
        manager.info('THEME', `Theme changed to: ${theme}`);
    }
}, 'Change console theme', 'dark|light');

// /font
registerCommand('font', (args) => {
    const size = args[0]?.toLowerCase();
    if (size !== 'sm' && size !== 'md' && size !== 'lg') {
        manager.warn('FONT', 'Usage: /font sm|md|lg');
        return;
    }
    try {
        const { useConsoleStore } = require('../hooks/useConsoleStore');
        useConsoleStore.getState().setFontSize(size as 'sm' | 'md' | 'lg');
        manager.info('FONT', `Font size changed to: ${size}`);
    } catch {
        manager.info('FONT', `Font size changed to: ${size}`);
    }
}, 'Change font size', 'sm|md|lg');

// /export
registerCommand('export', (args) => {
    const format = args[0]?.toLowerCase() ?? 'stl';
    if (format !== 'stl' && format !== 'obj' && format !== 'json' && format !== 'txt') {
        manager.warn('EXPORT', 'Usage: /export stl|obj|json|txt');
        return;
    }

    if (format === 'json' || format === 'txt') {
        // Export logs
        try {
            const { useConsoleStore } = require('../hooks/useConsoleStore');
            const { exportLogsAsJSON, exportLogsAsText } = require('./exportLogs');
            const logs = useConsoleStore.getState().logs;
            if (format === 'json') {
                exportLogsAsJSON(logs);
            } else {
                // Convert to ProcessedLog format for text export
                const processedLogs = logs.map((l: { ts: number; level: string; code: string; message: string; repeat?: number }) => ({
                    ...l,
                    count: l.repeat || 1,
                    id: `${l.ts}-${l.code}`
                }));
                exportLogsAsText(processedLogs);
            }
            manager.info('EXPORT', `Logs exported as ${format.toUpperCase()}`);
        } catch (err) {
            manager.error('EXPORT', `Failed to export logs: ${err}`);
        }
    } else {
        // Export 3D model
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Debug-only global for controller export access
        const controller = (window as any).__PF_CONTROLLER__;
        if (controller?.exportModel) {
            controller.exportModel(format);
            manager.info('EXPORT', `Model export triggered: ${format.toUpperCase()}`);
        } else {
            manager.warn('EXPORT', 'Export not available - controller not ready');
        }
    }
}, 'Export model or logs', 'stl|obj|json|txt');

// /dock
registerCommand('dock', (args) => {
    const pos = args[0]?.toLowerCase();
    if (pos !== 'bottom' && pos !== 'right' && pos !== 'float') {
        manager.warn('DOCK', 'Usage: /dock bottom|right|float');
        return;
    }
    try {
        const { useConsoleStore } = require('../hooks/useConsoleStore');
        useConsoleStore.getState().setDockPosition(pos as 'bottom' | 'right' | 'float');
        manager.info('DOCK', `Dock position changed to: ${pos}`);
    } catch {
        manager.info('DOCK', `Dock position changed to: ${pos}`);
    }
}, 'Change console dock position', 'bottom|right|float');

// ============================================================================
// REPL Mode - JavaScript Evaluation
// ============================================================================

/**
 * Evaluate a JavaScript expression in a sandboxed context.
 * Returns the result or throws an error.
 */
export function evaluateREPL(expression: string): unknown {
    // Create a sandboxed context with useful references
    const context: Record<string, unknown> = {
        // App store
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Debug-only REPL context references
        store: (window as any).__PF_STORE__?.getState(),
        // Controller
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Debug-only REPL context references
        controller: (window as any).__PF_CONTROLLER__,
        // MessageManager
        log: manager,
        // Console store (lazy loaded)
        console: undefined,
        // DOM helpers
        $: (selector: string) => document.querySelector(selector),
        $$: (selector: string) => document.querySelectorAll(selector),
        // Math utilities
        Math,
        JSON,
        // Performance
        performance,
    };

    // Try to get console store
    try {
        const { useConsoleStore } = require('../hooks/useConsoleStore');
        context.console = useConsoleStore.getState();
    } catch { /* ignore */ }

    // Create function with context variables
    const contextKeys = Object.keys(context);
    const contextValues = Object.values(context);

    try {
        // Use Function constructor for safer evaluation than eval()
        // Wrap in async to support await
        const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
        const fn = new AsyncFunction(...contextKeys, `return (${expression})`);
        return fn(...contextValues);
    } catch (syntaxError) {
        // Try as statement (e.g., assignments)
        try {
            const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
            const fn = new AsyncFunction(...contextKeys, expression);
            return fn(...contextValues);
        } catch (statementError) {
            throw syntaxError; // Return original error
        }
    }
}

/**
 * Execute a REPL expression and log the result.
 */
export async function executeREPL(expression: string): Promise<void> {
    try {
        const result = await evaluateREPL(expression);

        // Format output
        if (result === undefined) {
            manager.debug('REPL', '=> undefined');
        } else if (result === null) {
            manager.debug('REPL', '=> null');
        } else if (typeof result === 'object') {
            manager.info('REPL', '=> ', result as Record<string, unknown>);
        } else {
            manager.info('REPL', `=> ${String(result)}`);
        }
    } catch (err) {
        manager.error('REPL', `Error: ${err instanceof Error ? err.message : String(err)}`);
    }
}

// /eval - REPL command
registerCommand('eval', async (args) => {
    const expr = args.join(' ');
    if (!expr) {
        manager.warn('REPL', 'Usage: /eval <expression>');
        manager.info('REPL', 'Available context: store, controller, log, console, $(), $$()');
        return;
    }
    await executeREPL(expr);
}, 'Evaluate JavaScript expression', '<expression>');

// /js - Alias for /eval
registerCommand('js', async (args) => {
    const expr = args.join(' ');
    if (!expr) {
        manager.warn('REPL', 'Usage: /js <expression>');
        return;
    }
    await executeREPL(expr);
}, 'Evaluate JavaScript (alias for /eval)', '<expression>');
