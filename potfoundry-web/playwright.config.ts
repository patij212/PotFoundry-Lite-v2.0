import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for PotFoundry WebGPU E2E tests.
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',

    use: {
        baseURL: process.env.CI ? 'http://localhost:5173' : 'http://localhost:3001',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Enable WebGPU in Chromium
                launchOptions: {
                    args: [
                        '--enable-features=Vulkan',
                        '--enable-unsafe-webgpu',
                        '--enable-features=UseSkiaRenderer',
                    ],
                },
            },
        },
        {
            name: 'edge',
            use: {
                ...devices['Desktop Edge'],
                launchOptions: {
                    args: [
                        '--enable-features=Vulkan',
                        '--enable-unsafe-webgpu',
                    ],
                },
            },
        },
        // ── Mobile Device Emulation ──────────────────────────────
        {
            name: 'mobile-chrome',
            use: {
                ...devices['Pixel 7'],
                launchOptions: {
                    args: [
                        '--enable-features=Vulkan',
                        '--enable-unsafe-webgpu',
                    ],
                },
            },
        },
        {
            name: 'mobile-safari',
            use: {
                ...devices['iPhone 14'],
            },
        },
        {
            name: 'tablet',
            use: {
                ...devices['iPad (gen 7)'],
            },
        },
    ],

    /* Start dev server automatically in CI */
    webServer: process.env.CI
        ? {
              command: 'npm run dev',
              url: 'http://localhost:5173',
              reuseExistingServer: false,
              timeout: 120 * 1000,
          }
        : undefined,
});
