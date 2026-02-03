
import commonWgsl from '../../assets/shaders/common.wgsl?raw';
import previewUniformsWgsl from '../../assets/shaders/preview_uniforms.wgsl?raw';
import stylesWgsl from '../../assets/shaders/styles.wgsl?raw';
import previewMainWgsl from '../../assets/shaders/preview_main.wgsl?raw';
import { generateStyleConstants } from '../../utils/shaderGenerator';

import { STYLE_FUNCTION_MAP } from '../../styles/registry';

import { stripShaderCode } from '../../utils/shaderStripper';

export class ShaderManager {
    private static instance: ShaderManager;
    private commonWgsl: string = '';
    private uniformsWgsl: string = '';
    private stylesWgsl: string = '';
    private mainWgsl: string = '';
    private constantsWgsl: string = '';

    private constructor() {
        // Load raw strings once
        this.commonWgsl = this.getShaderContent(commonWgsl);
        this.uniformsWgsl = this.getShaderContent(previewUniformsWgsl);
        this.stylesWgsl = this.getShaderContent(stylesWgsl);
        this.mainWgsl = this.getShaderContent(previewMainWgsl);
        this.constantsWgsl = generateStyleConstants();

        if (!this.commonWgsl || !this.uniformsWgsl || !this.stylesWgsl || !this.mainWgsl) {
            console.error('[ShaderManager] Failed to load shader modules');
        }
    }

    public static getInstance(): ShaderManager {
        if (!ShaderManager.instance) {
            ShaderManager.instance = new ShaderManager();
        }
        return ShaderManager.instance;
    }

    private getShaderContent(mod: any): string {
        if (typeof mod === 'string') return mod;
        if (mod && typeof mod.default === 'string') return mod.default;
        return '';
    }

    /**
     * Generates WGSL with a specific style hardcoded, enabling compiler optimization (DCE).
     * @param styleId The ID of the style to compile for.
     */
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
     * Generates WGSL for the Preview Renderer (Vertex/Fragment).
     * Includes Preview Uniforms and Main logic.
     */
    public getStyleWGSL(styleId: number): string {
        return [
            this.getStyleEnvironmentWGSL(styleId),
            this.uniformsWgsl,
            this.mainWgsl
        ].join('\n');
    }

    // Legacy support (defaults to ID 0)
    public getWGSL(): string {
        return this.getStyleWGSL(0);
    }

    /**
     * Generates Vertex/Fragment shader for Debug Lines (magenta).
     * Projects 2D (u,v) segments onto the 3D pot surface.
     */
    public getDebugLinesWGSL(styleId: number): string {
        const env = this.getStyleEnvironmentWGSL(styleId);

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
        return [env, this.uniformsWgsl, main].join('\n');
    }
}
