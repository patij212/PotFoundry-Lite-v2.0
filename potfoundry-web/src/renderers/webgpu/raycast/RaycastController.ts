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
// bound kernel output: [0] global max, [1..64] per-bin max, [65..128] per-bin
// min, [129/130] global max |dr/dtheta| / |dr/dt|, [131..194] per-bin
// |dr/dtheta|, [195..258] per-bin |dr/dt| (Lipschitz reductions)
const BOUND_RESULT_BYTES = 259 * 4;
// Accumulation samples encodable in ONE frame. One-sample-per-rAF put a hard
// ~270ms floor (16 x 16.7ms) on convergence even on an idle GPU — and the
// visible artifact of slow convergence is seconds of unconverged sample-0
// aliasing (moire bands on grazing relief) after every camera change. Each
// ring slot is a distinct RC uniform buffer so per-sample jitter/phase values
// coexist inside a single command submission.
const RC_RING = 4;
const RC_RMAX_BYTE_OFFSET = 80;
const ACCUM_FORMAT: GPUTextureFormat = 'rgba16float';
const RAYCAST_PIPELINE_TIMEOUT_MS = 30_000;
const MIN_STEP_CAP = 64;
const MAX_STEP_CAP = 8_192;
const MIN_FEATURE_FLOOR_MM = 0.02;
const MAX_FEATURE_FLOOR_MM = 8.0;
const MIN_SAMPLES = 1;
const MAX_SAMPLES = 64;

// Bounds depend only on the outer profile/style inputs. Keep camera, lighting,
// topology, and cavity controls out of this set: they reset accumulation but
// must not rerun the expensive 256 x 512 bounds kernel.
const BOUND_GEOMETRY_INDICES = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 72, 73,
] as const;

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error(`${label} timed out after ${RAYCAST_PIPELINE_TIMEOUT_MS}ms (possible Dawn compiler hang)`)),
      RAYCAST_PIPELINE_TIMEOUT_MS
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

function boundedFinite(value: number, min: number, max: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(Math.max(value, min), max);
}

function sameFloat32(a: Float32Array | null, b: Float32Array | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

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
  private failedStyles = new Map<number, string>();
  private boundPipelines = new Map<number, GPUComputePipeline>();
  private bindGroups = new Map<number, GPUBindGroup[]>(); // one per ring slot
  private boundBindGroups = new Map<number, GPUBindGroup>();

  private resolvePipeline: GPURenderPipeline | null = null;
  private resolveBindGroup: GPUBindGroup | null = null;
  private resolveUniform: GPUBuffer;

  private rcUniformRing: GPUBuffer[] = [];
  private boundResult: GPUBuffer;
  private boundInit: GPUBuffer;
  private lutUniform: GPUBuffer;

  // adaptive samples-per-frame: EMA of the per-sample frame period feeds the
  // ring-batch size so a fast GPU converges in a few frames instead of 16
  private lastEncodeAt = 0;
  private lastEncodeSamples = 1;
  private emaSampleMs = 16;

  private accumTex: GPUTexture | null = null;
  private width = 0;
  private height = 0;

  private sampleIndex = 0;
  private lastSig: string | null = null;
  private lastBoundGeometry: Float32Array | null = null;
  private lastBoundStyleParams: Float32Array | null = null;
  private boundDirty = true;
  private activeStyleId = -1;
  private lastF32: Float32Array | null = null;

  private mobile = isMobileDevice();
  // step caps bound FIELD EVALS of the banded march (see preview_raycast.wgsl);
  // the effective sampling density is set by the feature floors — fine steps
  // only occur inside the per-z-bin surface band, so the caps are generous
  // ceilings for pathological (grazing) rays, not the effective step size.
  private stepCapInteractive = this.mobile ? 160 : 224;
  // The certified Lipschitz march cut typical per-ray cost ~3x, so the accum
  // cap doubles for free — deep grazing rays escalate their blind step floor
  // half as fast (floor grows with (evals/cap)^2), shrinking the razor-graze
  // divergence from the high-budget reference.
  private stepCapAccum = this.mobile ? 1024 : 1536;
  private featureFloorInteractive = this.mobile ? 1.0 : 0.6;
  private featureFloor = this.mobile ? 0.4 : 0.25; // accumulation floor (mm)
  private maxSamples = this.mobile ? 8 : 16;
  private debugMode = 0;

  constructor(device: GPUDevice, format: GPUTextureFormat, buffers: RaycastSharedBuffers) {
    this.device = device;
    this.format = format;
    this.buffers = buffers;
    for (let i = 0; i < RC_RING; i++) {
      this.rcUniformRing.push(device.createBuffer({
        label: `raycast:rc-uniforms-${i}`,
        size: 128,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }));
    }
    // 129 u32: [0] global max, [1..64] per-bin max, [65..128] per-bin min
    this.boundResult = device.createBuffer({
      label: 'raycast:bound-result',
      size: BOUND_RESULT_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    // init pattern: max slots -> 0, min slots -> +f32max bits (atomicMin identity)
    this.boundInit = device.createBuffer({
      label: 'raycast:bound-init',
      size: BOUND_RESULT_BYTES,
      usage: GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    const initBits = new Uint32Array(BOUND_RESULT_BYTES / 4);
    for (let i = 65; i <= 128; i++) initBits[i] = 0x7f7fffff;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Uint32Array<ArrayBufferLike> vs GPUAllowSharedBufferSource strict mode mismatch
    device.queue.writeBuffer(this.boundInit, 0, initBits.buffer as any);
    // per-z-bin [min,max] band LUT + global and per-bin Lipschitz slope
    // bounds, uniform so it works on fragment stages without storage-buffer
    // support (mirrors the RC uniform pattern). 258 u32 payload, sized to the
    // WGSL struct array<vec4<u32>, 65> = 1040 bytes.
    this.lutUniform = device.createBuffer({
      label: 'raycast:band-lut',
      size: 1040,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.resolveUniform = device.createBuffer({
      label: 'raycast:resolve-uniforms',
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  }

  public setQuality(q: { stepCapInteractive?: number; stepCapAccum?: number; featureFloor?: number; featureFloorInteractive?: number; maxSamples?: number }): void {
    let accepted = false;
    if (q.stepCapInteractive !== undefined) {
      const value = boundedFinite(Math.floor(q.stepCapInteractive), MIN_STEP_CAP, MAX_STEP_CAP);
      if (value !== null) { this.stepCapInteractive = value; accepted = true; }
    }
    if (q.stepCapAccum !== undefined) {
      const value = boundedFinite(Math.floor(q.stepCapAccum), MIN_STEP_CAP, MAX_STEP_CAP);
      if (value !== null) { this.stepCapAccum = value; accepted = true; }
    }
    if (q.featureFloor !== undefined) {
      const value = boundedFinite(q.featureFloor, MIN_FEATURE_FLOOR_MM, MAX_FEATURE_FLOOR_MM);
      if (value !== null) { this.featureFloor = value; accepted = true; }
    }
    if (q.featureFloorInteractive !== undefined) {
      const value = boundedFinite(q.featureFloorInteractive, MIN_FEATURE_FLOOR_MM, MAX_FEATURE_FLOOR_MM);
      if (value !== null) { this.featureFloorInteractive = value; accepted = true; }
    }
    if (q.maxSamples !== undefined) {
      const value = boundedFinite(Math.floor(q.maxSamples), MIN_SAMPLES, MAX_SAMPLES);
      if (value !== null) { this.maxSamples = value; accepted = true; }
    }
    // A valid request intentionally restarts accumulation even if it repeats the
    // current values; e2e/debug callers rely on that to refresh an idle frame.
    if (accepted) this.lastSig = null;
  }

  /** 0 = shaded, 1 = hit-data readback (t, z, rho), 2 = march diagnostics
   *  (fp_near, fp_far, band-hi at mid-height, feature floor as seen by WGSL),
   *  3 = march forensics (hit.t or -1, evals spent, capped/coarse flag). */
  public setDebugMode(mode: number): void {
    this.debugMode = mode;
    this.lastSig = null;
  }

  public isReady(styleId: number): boolean {
    return !this.failedStyles.has(styleId)
      && this.pipelines.has(styleId)
      && this.bindGroups.has(styleId)
      && this.boundPipelines.has(styleId)
      && this.boundBindGroups.has(styleId)
      && this.resolvePipeline !== null;
  }

  /** A failed style should use the mesh path instead of leaving raycast blank. */
  public hasStyleFailure(styleId: number): boolean {
    return this.failedStyles.has(styleId);
  }

  /** Dev/e2e diagnostics for a raycast fallback. */
  public getStyleFailure(styleId: number): string | null {
    return this.failedStyles.get(styleId) ?? null;
  }

  public needsFrame(): boolean {
    // Re-render while the accumulation is still converging OR while it is dirty
    // (lastSig === null). setQuality/setDebugMode/a param change null the sig to
    // request a fresh accumulation; the sampleIndex is only reset later, inside
    // notifyFrame, which the frame loop gates behind its idle-skip. Without the
    // dirty term the loop parks after convergence and never runs notifyFrame
    // again, so a post-convergence setQuality/setDebugMode can never take effect
    // (e.g. the e2e debug readback saw a permanently black frame). Reporting
    // "needs a frame" here keeps the loop active until the dirty frame lands.
    return this.sampleIndex < this.maxSamples || this.lastSig === null;
  }

  public setStyle(styleId: number): void {
    if (this.failedStyles.has(styleId) || this.pipelines.has(styleId) || this.compiling.has(styleId)) return;
    const task = (async () => {
      const sm = ShaderManager.getInstance();
      const module = this.device.createShaderModule({
        label: `raycast_style_${styleId}.wgsl`,
        code: sm.getRaycastWGSL(styleId),
      });
      const pipeline = await withTimeout(this.device.createRenderPipelineAsync({
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
      }), `Raycast render pipeline for style ${styleId}`);
      this.pipelines.set(styleId, pipeline);
      this.bindGroups.set(styleId, this.createRaycastBindGroups(pipeline));

      const boundModule = this.device.createShaderModule({
        label: `raycast_bound_${styleId}.wgsl`,
        code: sm.getRaycastBoundWGSL(styleId),
      });
      const boundPipeline = await withTimeout(this.device.createComputePipelineAsync({
        label: `raycast:bound-${styleId}`,
        layout: 'auto',
        compute: { module: boundModule, entryPoint: 'cs_bound' },
      }), `Raycast bounds pipeline for style ${styleId}`);
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
        this.resolvePipeline = await withTimeout(this.device.createRenderPipelineAsync({
          label: 'raycast:resolve',
          layout: 'auto',
          vertex: { module: rm, entryPoint: 'vs_resolve' },
          fragment: { module: rm, entryPoint: 'fs_resolve', targets: [{ format: this.format }] },
          primitive: { topology: 'triangle-list' },
        }), 'Raycast resolve pipeline');
      }
    })();
    this.compiling.set(styleId, task);
    task
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e);
        this.pipelines.delete(styleId);
        this.bindGroups.delete(styleId);
        this.boundPipelines.delete(styleId);
        this.boundBindGroups.delete(styleId);
        this.failedStyles.set(styleId, message);
        // Do not keep the global frame loop hot while webgpu_core transitions
        // this style onto the mesh fallback path.
        this.sampleIndex = this.maxSamples;
        this.lastSig = `failed:${styleId}`;
        console.error(`[Raycast] pipeline compile failed for style ${styleId}; falling back to mesh preview`, e);
      })
      .finally(() => this.compiling.delete(styleId));
  }

  private createRaycastBindGroups(pipeline: GPURenderPipeline): GPUBindGroup[] {
    return this.rcUniformRing.map((rcBuf, i) =>
      this.device.createBindGroup({
        label: `raycast:bind-group-main-${i}`,
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
          { binding: 8, resource: { buffer: rcBuf } },
          { binding: 10, resource: { buffer: this.lutUniform } },
        ],
      })
    );
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
        if (this.boundInputsChanged(f32, styleParams)) this.boundDirty = true;
      } else {
        if (this.boundInputsChanged(f32, styleParams)) this.boundDirty = true;
      }
    }
    this.lastF32 = f32;
  }

  /** Returns true only when the outer radius/band LUT can actually change. */
  private boundInputsChanged(f32: Float32Array, styleParams: Float32Array | null): boolean {
    const geometryChanged = !this.lastBoundGeometry
      || BOUND_GEOMETRY_INDICES.some((index, i) => f32[index] !== this.lastBoundGeometry![i]);
    if (!geometryChanged && sameFloat32(this.lastBoundStyleParams, styleParams)) return false;

    this.lastBoundGeometry = Float32Array.from(BOUND_GEOMETRY_INDICES, (index) => f32[index]);
    this.lastBoundStyleParams = styleParams ? Float32Array.from(styleParams) : null;
    return true;
  }

  private writeRcUniforms(target: GPUBuffer, s: number): boolean {
    if (!this.lastF32) return false;
    const vp = this.lastF32.slice(VP_MATRIX_OFFSET, VP_MATRIX_OFFSET + 16);
    const inv = invertMat4(vp);
    if (!inv) return false;
    const data = new Float32Array(RC_UNIFORM_BYTES / 4);
    data.set(inv, 0);
    data[16] = s === 0 ? 0 : halton(s, 2) - 0.5; // jitter.x (px)
    data[17] = s === 0 ? 0 : halton(s, 3) - 0.5; // jitter.y (px)
    data[18] = s === 0 ? 0 : halton(s, 5);       // march_phase
    data[19] = s;                                 // sample_index
    // data[20] = r_max — written by the bound-pass buffer copy, keep 0 here
    data[21] = s === 0 ? this.stepCapInteractive : this.stepCapAccum;
    data[22] = s === 0 ? this.featureFloorInteractive : this.featureFloor;
    data[23] = this.debugMode;
    data[24] = this.width;
    data[25] = this.height;
    // Write everything below r_max, then everything above it, so the GPU-copied
    // r_max at bytes 80-83 (data[20]) is never clobbered.
    this.device.queue.writeBuffer(target, 0, data.buffer, 0, RC_RMAX_BYTE_OFFSET);
    this.device.queue.writeBuffer(target, 84, data.buffer, 84, RC_UNIFORM_BYTES - 84);
    return true;
  }

  /** Samples to encode this frame: 1 while presenting the fresh interactive
   *  sample, then as many accumulation samples as fit a ~12ms frame budget. */
  private samplesThisFrame(): number {
    if (this.sampleIndex === 0) return 1;
    const now = performance.now();
    if (this.lastEncodeAt > 0) {
      const perSample = (now - this.lastEncodeAt) / Math.max(1, this.lastEncodeSamples);
      this.emaSampleMs = 0.7 * this.emaSampleMs + 0.3 * Math.min(perSample, 100);
    }
    return Math.max(1, Math.min(RC_RING, Math.floor(12 / Math.max(this.emaSampleMs, 1))));
  }

  /**
   * Encodes this frame's GPU work: optional bound pass, one accumulation
   * sample (if not converged), and the resolve blit to the swapchain.
   * Returns false (encode nothing) if pipelines or state are not ready.
   */
  public encode(encoder: GPUCommandEncoder, swapView: GPUTextureView, depthView: GPUTextureView): boolean {
    const pipeline = this.pipelines.get(this.activeStyleId);
    const ringGroups = this.bindGroups.get(this.activeStyleId);
    const boundPipeline = this.boundPipelines.get(this.activeStyleId);
    const boundBindGroup = this.boundBindGroups.get(this.activeStyleId);
    if (!pipeline || !ringGroups || !this.resolvePipeline || !this.accumTex || !boundPipeline || !boundBindGroup) {
      return false;
    }

    if (this.boundDirty) {
      encoder.copyBufferToBuffer(this.boundInit, 0, this.boundResult, 0, BOUND_RESULT_BYTES);
      const cp = encoder.beginComputePass({ label: 'raycast:bound-pass' });
      cp.setPipeline(boundPipeline);
      cp.setBindGroup(0, boundBindGroup);
      cp.dispatchWorkgroups(1);
      cp.end();
      // [0] global max -> RC.r_max in EVERY ring buffer; [1..258] per-bin
      // max/min + global and per-bin Lipschitz slope bounds -> the band LUT
      for (const rcBuf of this.rcUniformRing) {
        encoder.copyBufferToBuffer(this.boundResult, 0, rcBuf, RC_RMAX_BYTE_OFFSET, 4);
      }
      encoder.copyBufferToBuffer(this.boundResult, 4, this.lutUniform, 0, 1032);
      this.boundDirty = false;
    }

    const batch = this.samplesThisFrame();
    let encoded = 0;
    while (this.sampleIndex < this.maxSamples && encoded < batch) {
      const ringSlot = encoded;
      if (!this.writeRcUniforms(this.rcUniformRing[ringSlot], this.sampleIndex)) {
        if (encoded === 0) return false;
        break;
      }
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
      pass.setBindGroup(0, ringGroups[ringSlot]);
      pass.draw(3);
      pass.end();
      this.sampleIndex += 1;
      encoded += 1;
    }
    this.lastEncodeAt = performance.now();
    this.lastEncodeSamples = Math.max(1, encoded);

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
    for (const rcBuf of this.rcUniformRing) rcBuf.destroy();
    this.boundResult.destroy();
    this.boundInit.destroy();
    this.lutUniform.destroy();
    this.resolveUniform.destroy();
    this.failedStyles.clear();
  }
}
