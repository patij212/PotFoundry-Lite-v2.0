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
        baseURL: 'http://localhost:3000',
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
    ],

    /* 
     * NOTE: WebServer is disabled. Start dev server manually with `npm run dev`
     * before running E2E tests. This avoids timeout issues.
     */
    // webServer: {
    //     command: 'npm run dev',
    //     url: 'http://localhost:5173',
    //     reuseExistingServer: !process.env.CI,
    //     timeout: 120 * 1000,
    // },
});
