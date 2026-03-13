
import commonWgsl from '../../assets/shaders/common.wgsl?raw';
import previewUniformsWgsl from '../../assets/shaders/preview_uniforms.wgsl?raw';
import stylesWgsl from '../../assets/shaders/styles.wgsl?raw';
import previewMainWgsl from '../../assets/shaders/preview_main.wgsl?raw';
import previewMainMobileWgsl from '../../assets/shaders/preview_main_mobile.wgsl?raw';
import previewFullMobileWgsl from '../../assets/shaders/preview_full_mobile.wgsl?raw';
import errorEstimationWgsl from '../../assets/shaders/error_estimation.wgsl?raw';
import { generateStyleConstants } from '../../utils/shaderGenerator';

import { STYLE_FUNCTION_MAP } from '../../styles/registry';
import { isMobileDevice } from '../../ResizeManager';

import { stripShaderCode } from '../../utils/shaderStripper';

export class ShaderManager {
    private static instance: ShaderManager;
    private commonWgsl: string = '';
    private uniformsWgsl: string = '';
    private stylesWgsl: string = '';
    private mainWgsl: string = '';
    private mainMobileWgsl: string = '';
    private fullMobileWgsl: string = '';
    private constantsWgsl: string = '';
    private errorEstimationWgsl: string = '';
    private readonly mobile: boolean;

    private constructor() {
        // Load raw strings once
        this.commonWgsl = this.getShaderContent(commonWgsl);
        this.uniformsWgsl = this.getShaderContent(previewUniformsWgsl);
        this.stylesWgsl = this.getShaderContent(stylesWgsl);
        this.mainWgsl = this.getShaderContent(previewMainWgsl);
        this.mainMobileWgsl = this.getShaderContent(previewMainMobileWgsl);
        this.fullMobileWgsl = this.getShaderContent(previewFullMobileWgsl);
        this.constantsWgsl = generateStyleConstants();
        this.errorEstimationWgsl = this.getShaderContent(errorEstimationWgsl);
        this.mobile = isMobileDevice();

        if (!this.commonWgsl || !this.uniformsWgsl || !this.stylesWgsl || !this.mainWgsl) {
            console.error('[ShaderManager] Failed to load shader modules');
        }
        console.log(`[ShaderManager] Mobile detection: ${this.mobile} (UA: ${navigator.userAgent.substring(0, 80)}, touch: ${navigator.maxTouchPoints}, screen: ${window.screen.width}x${window.screen.height}, VITE_MOBILE: ${import.meta.env.VITE_MOBILE ?? 'unset'})`);
        if (this.mobile) {
            console.log(`[ShaderManager] Using mobile preview shader (${(this.fullMobileWgsl.length / 1024).toFixed(1)}KB base vs desktop ${(this.mainWgsl.length / 1024).toFixed(1)}KB)`);
        }
    }

    public static getInstance(): ShaderManager {
        if (!ShaderManager.instance) {
            ShaderManager.instance = new ShaderManager();
        }
        return ShaderManager.instance;
    }

    private getShaderContent(mod: string | { default: string }): string {
        if (typeof mod === 'string') return mod;
        if (mod && typeof mod.default === 'string') return mod.default;
        return '';
    }

    /**
     * Extracts ONLY the content of a named #region from styles.wgsl.
     * Returns the style function body without shared/surface code.
     */
    private extractStyleRegionOnly(functionName: string): string {
        const lines = this.stylesWgsl.split('\n');
        const output: string[] = [];
        let insideRegion = false;
        let keepCurrentRegion = false;

        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('// #region')) {
                insideRegion = true;
                const regionName = trimmed.replace('// #region', '').trim();
                keepCurrentRegion = regionName === functionName;
                continue; // skip the marker itself
            }
            if (trimmed.startsWith('// #endregion')) {
                insideRegion = false;
                keepCurrentRegion = false;
                continue;
            }
            if (insideRegion && keepCurrentRegion) {
                output.push(line);
            }
        }
        return output.join('\n');
    }

    /**
     * Extracts ONLY the main style function from a #region, skipping
     * optimized _zero/_tau variants that mobile preview doesn't need.
     */
    private extractMainStyleFunctionOnly(functionName: string): string {
        const fullRegion = this.extractStyleRegionOnly(functionName);
        const lines = fullRegion.split('\n');
        const output: string[] = [];
        const zeroFn = `fn ${functionName}_zero`;
        const tauFn = `fn ${functionName}_tau`;
        for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith(zeroFn) || trimmed.startsWith(tauFn)) {
                break;
            }
            output.push(line);
        }
        return output.join('\n');
    }

    /**
     * Generates the common environment (Constants + Common + Style + Dispatch).
     * Useful for Compute Shaders (Adaptive Export, Feature Extraction).
     */
    public getStyleEnvironmentWGSL(styleId: number): string {
        const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';

        // Strip functions from other styles to reduce compilation weight
        const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);

        // Dynamic dispatch replacement
        // Note: we ignore the 'style_id' argument in the shader since we know the pipeline is specialized.
        const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    // Pass 2PI to ensure correct wrapping logic if needed by shader
    return ${functionName}(TAU, t, r0);
}
`;

        return [
            this.constantsWgsl,
            this.commonWgsl,
            optimizedStylesWgsl,
            dispatchCode
        ].join('\n');
    }

    /**
     * Generates the assembled WGSL for GPU error estimation compute shader.
     * Prepends the style environment (Constants + Common + Styles + Dispatch)
     * to the error_estimation.wgsl shader, which defines its own uniforms,
     * bindings, and compute entry point.
     *
     * @param styleId The ID of the style to compile for.
     */
    public getErrorEstimationWGSL(styleId: number): string {
        const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';
        const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);

        const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(TAU, t, r0);
}
`;

        return [
            this.constantsWgsl,
            this.commonWgsl,
            optimizedStylesWgsl,
            dispatchCode,
            this.errorEstimationWgsl,
        ].join('\n');
    }

    /**
     * Generates WGSL for the Preview Renderer (Vertex/Fragment).
     * Includes Preview Uniforms and Main logic.
     * 
     * CRITICAL: We manually reconstruct the chain here to ensure 'uniformsWgsl' (which defines style_param)
     * appears BEFORE 'stylesWgsl' (which uses style_param).
     */
    public getStyleWGSL(styleId: number): string {
        const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';

        // Mobile: self-contained ultra-mobile shader (skips common/uniforms/styles surface logic)
        if (this.mobile) {
            // Mobile only needs the main style function + single dispatch wrapper
            const extractedStyle = this.extractMainStyleFunctionOnly(functionName);
            const mobileDispatch = `
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}
`;
            const parts = this.fullMobileWgsl.split('// __STYLE_SLOT__');
            const composed = [
                // Skip constantsWgsl on mobile — style constants are unused by mobile shader
                parts[0],             // Preamble: inline uniforms, helpers, pot profile
                extractedStyle,       // Just the main style function (no _zero/_tau)
                mobileDispatch,       // Single dispatcher (no _zero/_tau variants)
                parts[1] || '',       // Surface logic + vertex/fragment shaders
            ].join('\n');
            console.log(`[ShaderManager] Mobile ultra-compact: style=${functionName}, total=${(composed.length / 1024).toFixed(1)}KB, ${composed.split('\n').length} lines`);
            return composed;
        }

        // Re-generate dispatch code (same as in getStyleEnvironmentWGSL)
        const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    // Pass 2PI to ensure correct wrapping logic if needed by shader
    return ${functionName}(TAU, t, r0);
}
`;

        // Desktop: full composition with stripped styles
        const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);
        console.log(`[ShaderManager] Style ${styleId} (${functionName}) Stripped Size: ${optimizedStylesWgsl.length} bytes, ${optimizedStylesWgsl.split('\n').length} lines.`);

        return [
            this.constantsWgsl,    // 1. Constants
            this.commonWgsl,       // 2. Helpers
            this.uniformsWgsl,     // 3. Uniforms & style_param Definition
            optimizedStylesWgsl,   // 4. Styles (uses style_param)
            dispatchCode,          // 5. Dispatcher
            this.mainWgsl          // 6. Main (full desktop)
        ].join('\n');
    }

    // Legacy support (defaults to ID 0)
    public getWGSL(): string {
        return this.getStyleWGSL(0);
    }

    /**
     * Generates a "Universal" shader that includes ALL style functions
     * and a dynamic dispatch switch.
     * Used by ThumbnailRenderer to avoid recompiling for every preset.
     */
    public getUniversalWGSL(): string {
        // On mobile, universal shader (all styles) is too large — fall back to single-style
        if (this.mobile) {
            return this.getStyleWGSL(0);
        }

        // No stripping - include all styles
        const allStylesWgsl = this.stylesWgsl;

        // Generate dynamic dispatch for all styles
        const dispatchCode = `
// UNIVERSAL DISPATCHER
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    switch (style_id) {
        ${Object.entries(STYLE_FUNCTION_MAP).map(([id, func]) => `
        case ${id}: { return ${func}(th, t, r0); }`).join('')}
        default: { return sf_radius(th, t, r0); }
    }
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    switch (style_id) {
        ${Object.entries(STYLE_FUNCTION_MAP).map(([id, func]) => `
        case ${id}: { return ${func}(0.0, t, r0); }`).join('')}
        default: { return sf_radius(0.0, t, r0); }
    }
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    switch (style_id) {
        ${Object.entries(STYLE_FUNCTION_MAP).map(([id, func]) => `
        case ${id}: { return ${func}(TAU, t, r0); }`).join('')}
        default: { return sf_radius(TAU, t, r0); }
    }
}
`;

        return [
            this.constantsWgsl,    // 1. Constants
            this.commonWgsl,       // 2. Helpers
            this.uniformsWgsl,     // 3. Uniforms
            allStylesWgsl,         // 4. Styles (ALL of them)
            dispatchCode,          // 5. Dispatcher
            this.mainWgsl          // 6. Main (desktop only — mobile early-returns)
        ].join('\n');
    }

    /**
     * Generates Vertex/Fragment shader for Debug Lines (magenta).
     * Projects 2D (u,v) segments onto the 3D pot surface.
     */
    public getDebugLinesWGSL(styleId: number): string {
        // Manually build environment with correct order (Uniforms BEFORE Styles)
        const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';
        const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);

        const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    // Pass 2PI to ensure correct wrapping logic if needed by shader
    return ${functionName}(TAU, t, r0);
}
`;

        const main = `
@vertex
fn vs_main(@location(0) uv: vec2<f32>) -> @builtin(position) vec4<f32> {
            let H = getf(0u);
            let p = surface_point(0u, uv.x, uv.y);
            let p_center = vec3<f32>(p.x, p.y, p.z - 0.5 * H);
            var pos = vp_matrix() * vec4<f32>(p_center, 1.0);
            pos.z -= 0.0001 * pos.w; // Bring slightly forward to prevent z-fighting
            return pos;
        }

        @fragment
fn fs_main() -> @location(0) vec4<f32> {
            return vec4<f32>(1.0, 0.0, 1.0, 1.0); // Magenta Color
        }
            `;

        return [
            this.constantsWgsl,
            this.commonWgsl,
            this.uniformsWgsl, // Uniforms BEFORE Styles
            optimizedStylesWgsl,
            dispatchCode,
            main
        ].join('\n');
    }

    /**
     * Generates Vertex/Fragment shader for Debug Points (green).
     * Projects 2D (u,v) points onto the 3D pot surface as point-list.
     */
    public getDebugPointsWGSL(styleId: number): string {
        const functionName = STYLE_FUNCTION_MAP[styleId] || 'sf_radius';
        const optimizedStylesWgsl = stripShaderCode(this.stylesWgsl, functionName);

        const dispatchCode = `
// DYNAMICALLY GENERATED DISPATCH FOR STYLE ID ${styleId} (${functionName})
fn style_radius(style_id: i32, theta: f32, t: f32, r0: f32) -> f32 {
    let th = theta - floor(theta / TAU) * TAU;
    return ${functionName}(th, t, r0);
}

fn style_radius_zero(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(0.0, t, r0);
}

fn style_radius_tau(style_id: i32, t: f32, r0: f32) -> f32 {
    return ${functionName}(TAU, t, r0);
}
`;

        const main = `
struct PointVsOut {
    @builtin(position) pos: vec4<f32>,
    @location(0) kind: f32,
}

@vertex
fn vs_main(@location(0) utk: vec3<f32>) -> PointVsOut {
            var out: PointVsOut;
            let H = getf(0u);
            let p = surface_point(0u, utk.x, utk.y);
            let p_center = vec3<f32>(p.x, p.y, p.z - 0.5 * H);
            var pos = vp_matrix() * vec4<f32>(p_center, 1.0);
            pos.z -= 0.0002 * pos.w; // Bring slightly forward (above debug lines)
            out.pos = pos;
            out.kind = utk.z; // 0 = peak, 1 = valley
            return out;
        }

        @fragment
fn fs_main(@location(0) kind: f32) -> @location(0) vec4<f32> {
            // Peaks = green, Valleys = cyan-blue
            if (kind > 0.5) {
                return vec4<f32>(0.2, 0.6, 1.0, 1.0); // Blue for valleys
            }
            return vec4<f32>(0.0, 1.0, 0.0, 1.0); // Green for peaks
        }
            `;

        return [
            this.constantsWgsl,
            this.commonWgsl,
            this.uniformsWgsl,
            optimizedStylesWgsl,
            dispatchCode,
            main
        ].join('\n');
    }
}
