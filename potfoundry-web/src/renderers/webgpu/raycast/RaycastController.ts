/**
 * Exact ray-cast preview orchestrator.
 * Owns: per-style raycast render pipelines, the static resolve pipeline,
 * accumulation targets (rgba16float, additive blend), the RC uniform buffer,
 * and the GPU bounding-radius pass. Plugs into webgpu_core's frame path.
 * Spec: docs/superpowers/specs/2026-07-08-raycast-preview-design.md
 */
import { ShaderManager } from '../ShaderManager';
import { isMobileDevice } from '../../../ResizeManager';
import { VP_MATRIX_OFFSET } from '../../../camera_constants';
import { invertMat4, halton, decodeF16Array } from './rcMath';

export interface RaycastSharedBuffers {
  uniform: GPUBuffer;
  style: GPUBuffer;
  c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer;
  bg1: GPUBuffer; bg2: GPUBuffer; bg3: GPUBuffer;
}

const RC_UNIFORM_BYTES = 112;
const RC_RMAX_BYTE_OFFSET = 80;
const ACCUM_FORMAT: GPUTextureFormat = 'rgba16float';

const RESOLVE_WGSL = /* wgsl */ `
struct ResolveUniforms { inv_count: f32, _p0: f32, _p1: f32, _p2: f32, };
@group(0) @binding(0) var accum : texture_2d<f32>;
@group(0) @binding(1) var<uniform> RU : ResolveUniforms;

struct VSOut { @builtin(position) pos: vec4<f32>, };

@vertex
fn vs_resolve(@builtin(vertex_index) vid: u32) -> VSOut {
  var xy = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  var out: VSOut;
  out.pos = vec4<f32>(xy[vid], 0.5, 1.0);
  return out;
}

@fragment
fn fs_resolve(in: VSOut) -> @location(0) vec4<f32> {
  let texel = textureLoad(accum, vec2<i32>(in.pos.xy), 0);
  return vec4<f32>(texel.rgb * RU.inv_count, 1.0);
}
`;

export class RaycastController {
  private device: GPUDevice;
  private format: GPUTextureFormat;
  private buffers: RaycastSharedBuffers;

  private pipelines = new Map<number, GPURenderPipeline>();
  private compiling = new Map<number, Promise<void>>();
  private boundPipelines = new Map<number, GPUComputePipeline>();
  private bindGroups = new Map<number, GPUBindGroup>();
  private boundBindGroups = new Map<number, GPUBindGroup>();

  private resolvePipeline: GPURenderPipeline | null = null;
  private resolveBindGroup: GPUBindGroup | null = null;
  private resolveUniform: GPUBuffer;

  private rcUniform: GPUBuffer;
  private boundResult: GPUBuffer;
  private boundZero: GPUBuffer;

  private accumTex: GPUTexture | null = null;
  private width = 0;
  private height = 0;

  private sampleIndex = 0;
  private lastSig: string | null = null;
  private boundDirty = true;
  private activeStyleId = -1;
  private lastF32: Float32Array | null = null;

  private mobile = isMobileDevice();
  private stepCapInteractive = this.mobile ? 24 : 48;
  private stepCapAccum = this.mobile ? 64 : 128;
  private featureFloor = 0.25;
  private maxSamples = this.mobile ? 8 : 16;
  private debugMode: 0 | 1 = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat, buffers: RaycastSharedBuffers) {
    this.device = device;
    this.format = format;
    this.buffers = buffers;
    this.rcUniform = device.createBuffer({
      label: 'raycast:rc-uniforms',
      size: 128,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.boundResult = device.createBuffer({
      label: 'raycast:bound-result',
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.boundZero = device.createBuffer({
      label: 'raycast:bound-zero',
      size: 4,
      usage: GPUBufferUsage.COPY_SRC,
    });
    this.resolveUniform = device.createBuffer({
      label: 'raycast:resolve-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setQuality(q: { stepCapInteractive?: number; stepCapAccum?: number; featureFloor?: number; maxSamples?: number }): void {
    if (q.stepCapInteractive !== undefined) this.stepCapInteractive = q.stepCapInteractive;
    if (q.stepCapAccum !== undefined) this.stepCapAccum = q.stepCapAccum;
    if (q.featureFloor !== undefined) this.featureFloor = q.featureFloor;
    if (q.maxSamples !== undefined) this.maxSamples = q.maxSamples;
    this.lastSig = null; // force reset so new quality takes effect
  }

  public setDebugMode(mode: 0 | 1): void {
    this.debugMode = mode;
    this.lastSig = null;
  }

  public isReady(styleId: number): boolean {
    return this.pipelines.has(styleId) && this.resolvePipeline !== null;
  }

  public needsFrame(): boolean {
    return this.sampleIndex < this.maxSamples;
  }

  public setStyle(styleId: number): void {
    if (this.pipelines.has(styleId) || this.compiling.has(styleId)) return;
    const task = (async () => {
      const sm = ShaderManager.getInstance();
      const module = this.device.createShaderModule({
        label: `raycast_style_${styleId}.wgsl`,
        code: sm.getRaycastWGSL(styleId),
      });
      const pipeline = await this.device.createRenderPipelineAsync({
        label: `raycast:pipeline-${styleId}`,
        layout: 'auto',
        vertex: { module, entryPoint: 'vs_raycast' },
        fragment: {
          module,
          entryPoint: 'fs_raycast',
          targets: [{
            format: ACCUM_FORMAT,
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          }],
        },
        primitive: { topology: 'triangle-list' },
        // 'always' + write: jittered re-renders must never be killed by the
        // previous sample's depth; all samples of a pixel have ~equal depth.
        depthStencil: { depthWriteEnabled: true, depthCompare: 'always', format: 'depth24plus' },
      });
      this.pipelines.set(styleId, pipeline);
      this.bindGroups.set(styleId, this.createRaycastBindGroup(pipeline));

      const boundModule = this.device.createShaderModule({
        label: `raycast_bound_${styleId}.wgsl`,
        code: sm.getRaycastBoundWGSL(styleId),
      });
      const boundPipeline = await this.device.createComputePipelineAsync({
        label: `raycast:bound-${styleId}`,
        layout: 'auto',
        compute: { module: boundModule, entryPoint: 'cs_bound' },
      });
      this.boundPipelines.set(styleId, boundPipeline);
      this.boundBindGroups.set(styleId, this.device.createBindGroup({
        label: `raycast:bound-bg-${styleId}`,
        layout: boundPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: this.buffers.uniform } },
          { binding: 4, resource: { buffer: this.buffers.style } },
          { binding: 9, resource: { buffer: this.boundResult } },
        ],
      }));

      if (!this.resolvePipeline) {
        const rm = this.device.createShaderModule({ label: 'raycast_resolve.wgsl', code: RESOLVE_WGSL });
        this.resolvePipeline = await this.device.createRenderPipelineAsync({
          label: 'raycast:resolve',
          layout: 'auto',
          vertex: { module: rm, entryPoint: 'vs_resolve' },
          fragment: { module: rm, entryPoint: 'fs_resolve', targets: [{ format: this.format }] },
          primitive: { topology: 'triangle-list' },
        });
      }
    })();
    this.compiling.set(styleId, task);
    task
      .catch((e) => console.error(`[Raycast] pipeline compile failed for style ${styleId}`, e))
      .finally(() => this.compiling.delete(styleId));
  }

  private createRaycastBindGroup(pipeline: GPURenderPipeline): GPUBindGroup {
    return this.device.createBindGroup({
      label: 'raycast:bind-group-main',
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.buffers.uniform } },
        { binding: 1, resource: { buffer: this.buffers.c1 } },
        { binding: 2, resource: { buffer: this.buffers.c2 } },
        { binding: 3, resource: { buffer: this.buffers.c3 } },
        { binding: 4, resource: { buffer: this.buffers.style } },
        { binding: 5, resource: { buffer: this.buffers.bg1 } },
        { binding: 6, resource: { buffer: this.buffers.bg2 } },
        { binding: 7, resource: { buffer: this.buffers.bg3 } },
        { binding: 8, resource: { buffer: this.rcUniform } },
      ],
    });
  }

  private ensureTargets(w: number, h: number): void {
    if (this.accumTex && this.width === w && this.height === h) return;
    this.accumTex?.destroy();
    this.accumTex = this.device.createTexture({
      label: 'raycast:accum',
      size: [Math.max(1, w), Math.max(1, h)],
      format: ACCUM_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    this.width = w;
    this.height = h;
    this.resolveBindGroup = null; // texture view changed
    this.sampleIndex = 0;
    this.lastSig = null;
  }

  /**
   * Per-frame state update. Detects any change in the 76 preview uniforms,
   * style params, or canvas size; a change resets accumulation to sample 0.
   */
  public notifyFrame(f32: Float32Array, styleParams: Float32Array | null, w: number, h: number): void {
    this.ensureTargets(w, h);
    const styleId = Math.round(f32[7]);
    let sig = `${styleId}|${w}x${h}|${this.debugMode}|`;
    for (let i = 0; i < f32.length; i++) sig += f32[i] + ',';
    if (styleParams) for (let i = 0; i < styleParams.length; i++) sig += styleParams[i] + ',';

    if (sig !== this.lastSig) {
      this.sampleIndex = 0;
      this.lastSig = sig;
      if (styleId !== this.activeStyleId) {
        this.activeStyleId = styleId;
        this.boundDirty = true;
      } else {
        this.boundDirty = true; // params may change the max radius too — cheap, redo it
      }
    }
    this.lastF32 = f32;
  }

  private writeRcUniforms(): boolean {
    if (!this.lastF32) return false;
    const vp = this.lastF32.slice(VP_MATRIX_OFFSET, VP_MATRIX_OFFSET + 16);
    const inv = invertMat4(vp);
    if (!inv) return false;
    const data = new Float32Array(RC_UNIFORM_BYTES / 4);
    data.set(inv, 0);
    const s = this.sampleIndex;
    data[16] = s === 0 ? 0 : halton(s, 2) - 0.5; // jitter.x (px)
    data[17] = s === 0 ? 0 : halton(s, 3) - 0.5; // jitter.y (px)
    data[18] = s === 0 ? 0 : halton(s, 5);       // march_phase
    data[19] = s;                                 // sample_index
    // data[20] = r_max — written by the bound-pass buffer copy, keep 0 here
    data[21] = s === 0 ? this.stepCapInteractive : this.stepCapAccum;
    data[22] = this.featureFloor;
    data[23] = this.debugMode;
    data[24] = this.width;
    data[25] = this.height;
    // Write everything below r_max, then everything above it, so the GPU-copied
    // r_max at bytes 80-83 (data[20]) is never clobbered.
    this.device.queue.writeBuffer(this.rcUniform, 0, data.buffer, 0, RC_RMAX_BYTE_OFFSET);
    this.device.queue.writeBuffer(this.rcUniform, 84, data.buffer, 84, RC_UNIFORM_BYTES - 84);
    return true;
  }

  /**
   * Encodes this frame's GPU work: optional bound pass, one accumulation
   * sample (if not converged), and the resolve blit to the swapchain.
   * Returns false (encode nothing) if pipelines or state are not ready.
   */
  public encode(encoder: GPUCommandEncoder, swapView: GPUTextureView, depthView: GPUTextureView): boolean {
    const pipeline = this.pipelines.get(this.activeStyleId);
    const bindGroup = this.bindGroups.get(this.activeStyleId);
    const boundPipeline = this.boundPipelines.get(this.activeStyleId);
    const boundBindGroup = this.boundBindGroups.get(this.activeStyleId);
    if (!pipeline || !bindGroup || !this.resolvePipeline || !this.accumTex || !boundPipeline || !boundBindGroup) {
      return false;
    }
    if (!this.writeRcUniforms()) return false;

    if (this.boundDirty) {
      encoder.copyBufferToBuffer(this.boundZero, 0, this.boundResult, 0, 4);
      const cp = encoder.beginComputePass({ label: 'raycast:bound-pass' });
      cp.setPipeline(boundPipeline);
      cp.setBindGroup(0, boundBindGroup);
      cp.dispatchWorkgroups(1);
      cp.end();
      encoder.copyBufferToBuffer(this.boundResult, 0, this.rcUniform, RC_RMAX_BYTE_OFFSET, 4);
      this.boundDirty = false;
    }

    if (this.sampleIndex < this.maxSamples) {
      const accumView = this.accumTex.createView();
      const pass = encoder.beginRenderPass({
        label: 'raycast:sample-pass',
        colorAttachments: [{
          view: accumView,
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: this.sampleIndex === 0 ? 'clear' : 'load',
          storeOp: 'store',
        }],
        depthStencilAttachment: {
          view: depthView,
          depthClearValue: 1.0,
          depthLoadOp: this.sampleIndex === 0 ? 'clear' : 'load',
          depthStoreOp: 'store',
        },
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
      this.sampleIndex += 1;
    }

    const invCount = 1 / Math.max(1, this.sampleIndex);
    this.device.queue.writeBuffer(this.resolveUniform, 0, new Float32Array([invCount, 0, 0, 0]).buffer);
    if (!this.resolveBindGroup) {
      this.resolveBindGroup = this.device.createBindGroup({
        label: 'raycast:resolve-bg',
        layout: this.resolvePipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.accumTex.createView() },
          { binding: 1, resource: { buffer: this.resolveUniform } },
        ],
      });
    }
    const resolvePass = encoder.beginRenderPass({
      label: 'raycast:resolve-pass',
      colorAttachments: [{
        view: swapView,
        clearValue: { r: 0, g: 0, b: 0, a: 1 },
        loadOp: 'clear',
        storeOp: 'store',
      }],
    });
    resolvePass.setPipeline(this.resolvePipeline);
    resolvePass.setBindGroup(0, this.resolveBindGroup);
    resolvePass.draw(3);
    resolvePass.end();
    return true;
  }

  /** Dev/e2e: read back a region of the accumulation texture as f32 rgba. */
  public async readbackPixels(x: number, y: number, w: number, h: number): Promise<Float32Array> {
    if (!this.accumTex) throw new Error('raycast: no accumulation texture');
    const bytesPerPixel = 8; // rgba16float
    const unpadded = w * bytesPerPixel;
    const padded = Math.ceil(unpadded / 256) * 256;
    const buf = this.device.createBuffer({
      label: 'raycast:readback',
      size: padded * h,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const encoder = this.device.createCommandEncoder({ label: 'raycast:readback-encoder' });
    encoder.copyTextureToBuffer(
      { texture: this.accumTex, origin: { x, y } },
      { buffer: buf, bytesPerRow: padded },
      { width: w, height: h }
    );
    this.device.queue.submit([encoder.finish()]);
    await buf.mapAsync(GPUMapMode.READ);
    const raw = new Uint8Array(buf.getMappedRange()).slice();
    buf.unmap();
    buf.destroy();
    const out = new Float32Array(w * h * 4);
    for (let row = 0; row < h; row++) {
      const rowU16 = new Uint16Array(raw.buffer, row * padded, w * 4);
      out.set(decodeF16Array(rowU16), row * w * 4);
    }
    // Accumulated values are sums — normalize to per-sample means.
    const inv = 1 / Math.max(1, this.sampleIndex);
    for (let i = 0; i < out.length; i++) out[i] *= inv;
    return out;
  }

  public dispose(): void {
    this.accumTex?.destroy();
    this.rcUniform.destroy();
    this.boundResult.destroy();
    this.boundZero.destroy();
    this.resolveUniform.destroy();
  }
}
