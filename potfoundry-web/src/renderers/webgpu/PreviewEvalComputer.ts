import { ShaderManager } from './ShaderManager';

/**
 * Prototype eval-compute stage for the compile-once / instant-switch preview.
 *
 * Runs two compute passes off the shared preview uniform buffers:
 *   1. eval_pos       — universal (all-styles) position eval → position buffer
 *   2. norm_from_nbr  — style-free normal from grid neighbours → normal buffer
 *
 * Both pipelines compile ONCE (universal / style-free), so a style switch is a
 * uniform write + {@link evaluate} dispatch — never a recompile. The vertex-index
 * → (segment, u, v) walk and the neighbour indices are supplied by the host (see
 * webgpu_core wiring) so the shaders stay free of the vs_main cell walk.
 *
 * Flag-gated prototype: constructed only when the preview-eval dev flag is on.
 */
export class PreviewEvalComputer {
  private readonly device: GPUDevice;
  private readonly uniformBuffer: GPUBuffer;
  private readonly styleParamBuffer: GPUBuffer;

  private evalPipeline: GPUComputePipeline | null = null;
  private normPipeline: GPUComputePipeline | null = null;

  private _positionBuffer: GPUBuffer | null = null;
  private _normalBuffer: GPUBuffer | null = null;
  private segBuffer: GPUBuffer | null = null;
  private uvBuffer: GPUBuffer | null = null;
  private nbrBuffer: GPUBuffer | null = null;

  private evalBind0: GPUBindGroup | null = null;
  private evalBind1: GPUBindGroup | null = null;
  private normBind0: GPUBindGroup | null = null;

  private vertexCount = 0;

  /** vec3<f32> storage array element stride (12-byte value padded to 16). */
  private static readonly VEC3_STRIDE = 16;
  /** Nbr struct = 6 × u32. */
  private static readonly NBR_STRIDE = 24;
  private static readonly WG_SIZE = 64;
  /** WebGPU maxComputeWorkgroupsPerDimension default — dispatch 2D past this. */
  private static readonly MAX_DIM = 65535;

  constructor(device: GPUDevice, uniformBuffer: GPUBuffer, styleParamBuffer: GPUBuffer) {
    this.device = device;
    this.uniformBuffer = uniformBuffer;
    this.styleParamBuffer = styleParamBuffer;
  }

  /** Compile both compute pipelines (once). ~15 s for the universal eval on cold cache. */
  async ensureCompiled(): Promise<void> {
    if (this.evalPipeline && this.normPipeline) return;
    const sm = ShaderManager.getInstance();
    const evalModule = this.device.createShaderModule({
      label: 'preview_eval_pos.wgsl',
      code: sm.getEvalPositionWGSL(),
    });
    const normModule = this.device.createShaderModule({
      label: 'preview_norm_from_nbr.wgsl',
      code: sm.getNeighborNormalWGSL(),
    });
    [this.evalPipeline, this.normPipeline] = await Promise.all([
      this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: evalModule, entryPoint: 'eval_pos' } }),
      this.device.createComputePipelineAsync({ layout: 'auto', compute: { module: normModule, entryPoint: 'norm_from_nbr' } }),
    ]);
  }

  /**
   * (Re)allocate the position/normal output buffers and upload the per-vertex
   * index inputs. Call whenever the preview vertex count changes (dimensions/
   * resolution). `segData`: 1 × u32/vertex. `uvData`: 2 × f32/vertex.
   * `nbrData`: 6 × u32/vertex {iL, iR, iD, iU, flags, pad0}.
   */
  resize(vertexCount: number, segData: Uint32Array, uvData: Float32Array, nbrData: Uint32Array): void {
    if (!this.evalPipeline || !this.normPipeline) return;
    this.vertexCount = vertexCount;

    this.destroyBuffers();

    const D = this.device;
    const posBytes = vertexCount * PreviewEvalComputer.VEC3_STRIDE;
    this._positionBuffer = D.createBuffer({ label: 'preview-eval-pos', size: posBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this._normalBuffer = D.createBuffer({ label: 'preview-eval-norm', size: posBytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.segBuffer = D.createBuffer({ label: 'preview-eval-seg', size: vertexCount * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.uvBuffer = D.createBuffer({ label: 'preview-eval-uv', size: vertexCount * 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.nbrBuffer = D.createBuffer({ label: 'preview-eval-nbr', size: vertexCount * PreviewEvalComputer.NBR_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- typed-array vs GPUAllowSharedBufferSource strict-mode mismatch
    D.queue.writeBuffer(this.segBuffer, 0, segData as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    D.queue.writeBuffer(this.uvBuffer, 0, uvData as any);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above
    D.queue.writeBuffer(this.nbrBuffer, 0, nbrData as any);

    this.evalBind0 = D.createBindGroup({
      layout: this.evalPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 4, resource: { buffer: this.styleParamBuffer } },
      ],
    });
    this.evalBind1 = D.createBindGroup({
      layout: this.evalPipeline.getBindGroupLayout(1),
      entries: [
        { binding: 0, resource: { buffer: this._positionBuffer } },
        { binding: 1, resource: { buffer: this.segBuffer } },
        { binding: 2, resource: { buffer: this.uvBuffer } },
      ],
    });
    this.normBind0 = D.createBindGroup({
      layout: this.normPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this._positionBuffer } },
        { binding: 1, resource: { buffer: this.nbrBuffer } },
        { binding: 2, resource: { buffer: this._normalBuffer } },
      ],
    });
  }

  /** Encode + submit both compute passes. Cheap (GPU dispatch, no recompile). */
  evaluate(): void {
    if (!this.evalPipeline || !this.normPipeline || !this.evalBind0 || !this.evalBind1 || !this.normBind0) return;
    const groups = Math.ceil(this.vertexCount / PreviewEvalComputer.WG_SIZE);
    if (groups === 0) return;
    // 2D dispatch to get past the 65535 per-dimension workgroup limit; the shaders
    // rebuild the linear index from num_workgroups. Covers up to 65535*65535*64 verts.
    const wgX = Math.min(groups, PreviewEvalComputer.MAX_DIM);
    const wgY = Math.ceil(groups / wgX);
    const enc = this.device.createCommandEncoder({ label: 'preview-eval' });
    const p1 = enc.beginComputePass();
    p1.setPipeline(this.evalPipeline);
    p1.setBindGroup(0, this.evalBind0);
    p1.setBindGroup(1, this.evalBind1);
    p1.dispatchWorkgroups(wgX, wgY);
    p1.end();
    const p2 = enc.beginComputePass();
    p2.setPipeline(this.normPipeline);
    p2.setBindGroup(0, this.normBind0);
    p2.dispatchWorkgroups(wgX, wgY);
    p2.end();
    this.device.queue.submit([enc.finish()]);
  }

  get positionBuffer(): GPUBuffer | null { return this._positionBuffer; }
  get normalBuffer(): GPUBuffer | null { return this._normalBuffer; }

  private destroyBuffers(): void {
    for (const b of [this._positionBuffer, this._normalBuffer, this.segBuffer, this.uvBuffer, this.nbrBuffer]) {
      try { b?.destroy(); } catch { /* ignore */ }
    }
    this._positionBuffer = null;
    this._normalBuffer = null;
    this.segBuffer = null;
    this.uvBuffer = null;
    this.nbrBuffer = null;
  }

  dispose(): void {
    this.destroyBuffers();
    this.evalBind0 = null;
    this.evalBind1 = null;
    this.normBind0 = null;
  }
}
