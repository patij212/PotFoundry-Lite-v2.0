/**
 * Network traffic monitor for DevConsole.
 * 
 * Intercepts fetch and XMLHttpRequest to capture network activity
 * for display in the Network tab.
 * 
 * @module ui/debug/utils/NetworkMonitor
 */

import { NetworkEntry } from '../hooks/useConsoleStore';

type NetworkCallback = (entry: NetworkEntry) => void;

let isInstalled = false;
let callback: NetworkCallback | null = null;
const origFetch = window.fetch;
const origXhrOpen = XMLHttpRequest.prototype.open;
const origXhrSend = XMLHttpRequest.prototype.send;

/**
 * Install the network monitor.
 * Intercepts fetch and XHR requests.
 * 
 * @param onCapture Callback when a network request completes
 * @returns Cleanup function to uninstall
 */
export function installNetworkMonitor(onCapture: NetworkCallback): () => void {
    if (isInstalled) {
        console.warn('[NetworkMonitor] Already installed');
        return () => { };
    }

    isInstalled = true;
    callback = onCapture;

    // Intercept fetch
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const id = `fetch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const startTime = performance.now();
        const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        const method = (init?.method || 'GET').toUpperCase() as NetworkEntry['method'];

        try {
            const response = await origFetch.call(window, input, init);
            const endTime = performance.now();

            // Clone to read size without consuming body
            const clone = response.clone();
            let size: number | undefined;
            try {
                const blob = await clone.blob();
                size = blob.size;
            } catch { /* ignore */ }

            if (callback) {
                callback({
                    id,
                    method,
                    url,
                    status: response.status,
                    startTime,
                    endTime,
                    duration: endTime - startTime,
                    size,
                });
            }

            return response;
        } catch (err) {
            const endTime = performance.now();
            if (callback) {
                callback({
                    id,
                    method,
                    url,
                    status: 0,
                    startTime,
                    endTime,
                    duration: endTime - startTime,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            throw err;
        }
    };

    // Intercept XHR
    XMLHttpRequest.prototype.open = function (
        method: string,
        url: string | URL,
        async?: boolean,
        username?: string | null,
        password?: string | null
    ) {
        /* eslint-disable @typescript-eslint/no-explicit-any -- Attaching tracking metadata to XHR instance for network monitoring */
        (this as any).__nm_method = method.toUpperCase();
        (this as any).__nm_url = typeof url === 'string' ? url : url.href;
        (this as any).__nm_id = `xhr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        /* eslint-enable @typescript-eslint/no-explicit-any */
        return origXhrOpen.call(this, method, url, async ?? true, username, password);
    };

    XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
        const xhr = this as XMLHttpRequest & { __nm_method: string; __nm_url: string; __nm_id: string };
        const startTime = performance.now();

        const handleComplete = () => {
            const endTime = performance.now();
            if (callback) {
                callback({
                    id: xhr.__nm_id,
                    method: xhr.__nm_method as NetworkEntry['method'],
                    url: xhr.__nm_url,
                    status: xhr.status,
                    startTime,
                    endTime,
                    duration: endTime - startTime,
                    size: xhr.responseText?.length,
                    error: xhr.status === 0 ? 'Request failed' : undefined,
                });
            }
        };

        xhr.addEventListener('load', handleComplete);
        xhr.addEventListener('error', handleComplete);
        xhr.addEventListener('abort', handleComplete);

        return origXhrSend.call(this, body);
    };

    return () => {
        isInstalled = false;
        callback = null;
        window.fetch = origFetch;
        XMLHttpRequest.prototype.open = origXhrOpen;
        XMLHttpRequest.prototype.send = origXhrSend;
    };
}

/**
 * Check if network monitor is currently installed.
 */
export function isNetworkMonitorInstalled(): boolean {
    return isInstalled;
}
