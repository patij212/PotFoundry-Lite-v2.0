/**
 * Validates the composed mobile shader using Chrome's WebGPU implementation via Playwright.
 * This catches WGSL errors that a text parser might miss — runs through the real Tint compiler.
 */
const { firefox } = require('playwright');
const fs = require('fs');

(async () => {
    const shaderSource = fs.readFileSync('composed_mobile_shader.wgsl', 'utf8');
    console.log(`Shader: ${shaderSource.length} bytes, ${shaderSource.split('\n').length} lines`);

    const browser = await firefox.launch({
        headless: false,
        firefoxUserPrefs: {
            'dom.webgpu.enabled': true,
            'gfx.webgpu.force-enabled': true,
        },
    });
    const page = await browser.newPage();
    await page.goto('about:blank');

    const result = await page.evaluate(async (wgsl) => {
        if (!navigator.gpu) {
            return { error: 'WebGPU not available in this browser' };
        }
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) {
            return { error: 'No GPU adapter available' };
        }
        const device = await adapter.requestDevice();

        // Create shader module
        const module = device.createShaderModule({
            label: 'test_mobile_shader',
            code: wgsl,
        });

        // Get compilation info
        const info = await module.getCompilationInfo();
        const messages = info.messages.map(m => ({
            type: m.type,
            lineNum: m.lineNum,
            linePos: m.linePos,
            message: m.message,
            offset: m.offset,
            length: m.length,
        }));

        // Try to create a pipeline
        let pipelineError = null;
        try {
            const pipeline = await device.createRenderPipelineAsync({
                layout: 'auto',
                vertex: { module, entryPoint: 'vs_main' },
                fragment: {
                    module,
                    entryPoint: 'fs_main',
                    targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
                },
                primitive: { topology: 'triangle-list', cullMode: 'none' },
                depthStencil: {
                    depthWriteEnabled: true,
                    depthCompare: 'less',
                    format: 'depth24plus',
                },
            });
            return { success: true, messages, pipelineCreated: true };
        } catch (e) {
            pipelineError = e.message || String(e);
        }

        return {
            success: messages.filter(m => m.type === 'error').length === 0,
            messages,
            pipelineError,
        };
    }, shaderSource);

    console.log('\n=== WGSL Validation Result ===');
    console.log(JSON.stringify(result, null, 2));

    if (result.success && result.pipelineCreated) {
        console.log('\n✅ Shader compiled and pipeline created successfully!');
    } else if (result.error) {
        console.log(`\n❌ ${result.error}`);
    } else {
        console.log('\n❌ Shader validation failed:');
        if (result.messages && result.messages.length > 0) {
            for (const m of result.messages) {
                console.log(`  ${m.type} [line ${m.lineNum}:${m.linePos}]: ${m.message}`);
            }
        }
        if (result.pipelineError) {
            console.log(`  Pipeline error: ${result.pipelineError}`);
        }
    }

    await browser.close();
})().catch(e => {
    console.error('Script error:', e);
    process.exit(1);
});
