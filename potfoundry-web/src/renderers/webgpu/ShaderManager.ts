
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
    public getStyleWGSL(styleId: number): string {
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
            this.uniformsWgsl,
            optimizedStylesWgsl,
            dispatchCode,
            this.mainWgsl
        ].join('\n');
    }

    // Legacy support (defaults to ID 0)
    public getWGSL(): string {
        return this.getStyleWGSL(0);
    }
}
