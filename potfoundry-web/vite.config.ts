import { defineConfig, type PluginOption } from 'vitest/config';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { execSync } from 'node:child_process';

const isMobileMode = process.env.VITE_MOBILE === '1';

/** Firewall rule name prefix — includes port for uniqueness */
const FIREWALL_RULE_PREFIX = 'PotFoundry Mobile Dev';

/**
 * Vite plugin that auto-manages a Windows Firewall inbound rule for the
 * mobile dev server. Detects the actual listening port (handles Vite port
 * bumping), checks if a rule already exists, and adds one if missing.
 * Falls back to a helpful console message when not running elevated.
 * No-ops on non-Windows platforms.
 */
function mobileFirewallPlugin(): PluginOption {
    return {
        name: 'potfoundry-mobile-firewall',
        configureServer(server) {
            server.httpServer?.on('listening', () => {
                if (process.platform !== 'win32') return;

                const addr = server.httpServer?.address();
                if (!addr || typeof addr === 'string') return;
                const port = addr.port;
                const ruleName = `${FIREWALL_RULE_PREFIX} (${port})`;

                try {
                    execSync(
                        `netsh advfirewall firewall show rule name="${ruleName}"`,
                        { stdio: 'pipe' },
                    );
                    // Rule already exists — nothing to do
                } catch {
                    // Rule doesn't exist — try to add it
                    try {
                        execSync(
                            `netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}`,
                            { stdio: 'pipe' },
                        );
                        server.config.logger.info(
                            `\n  ✅ Firewall rule added for port ${port}\n`,
                        );
                    } catch {
                        server.config.logger.warn(
                            `\n  ⚠️  Could not add firewall rule for port ${port} (not elevated).` +
                            `\n  Run once in an admin PowerShell:\n` +
                            `\n    netsh advfirewall firewall add rule name="${ruleName}" dir=in action=allow protocol=TCP localport=${port}\n`,
                        );
                    }
                }
            });
        },
    };
}

export default defineConfig({
    plugins: [
        react(),
        ...(isMobileMode ? [basicSsl(), mobileFirewallPlugin()] : []),
    ],
    build: {
        outDir: 'dist',
        sourcemap: true,
        emptyOutDir: true,
    },
    server: {
        port: isMobileMode ? 3443 : 3000,
        host: isMobileMode ? '0.0.0.0' : '127.0.0.1',
    },
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        // src/ is the product; research/ is the dev-only meshing lab (Tasks read src/ types, never the reverse).
        include: ['src/**/*.test.{ts,tsx}', 'research/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'src/**/*.test.{ts,tsx}',
                'src/test/**',
                'src/main.tsx',
                'src/vite-env.d.ts',
            ],
            // Thresholds can be enabled once more tests are added:
            // thresholds: {
            //     statements: 80,
            //     branches: 80,
            //     functions: 80,
            //     lines: 80,
            // },
        },
    },
});
