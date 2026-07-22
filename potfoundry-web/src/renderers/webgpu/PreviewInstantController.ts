import { ShaderManager } from './ShaderManager';
import { PreviewEvalComputer } from './PreviewEvalComputer';
import { buildPreviewEvalIndexBuffers, type PreviewEvalCounts } from './previewEvalIndex';

/**
 * Flag-gated instant-switch preview path.
 *
 * Owns the style-INDEPENDENT render pipeline (getInstantPreviewWGSL, compiled
 * once) plus a {@link PreviewEvalComputer} that recomputes per-vertex position +
 * normal from the shared uniform buffers. A style switch is then a uniform write
 * + eval dispatch — no pipeline recompile. Keeps all the plumbing out of
 * webgpu_core, which only needs to call {@link updateAndDispatch} before its
 * render pass and {@link draw} inside it.
 *
 * Prototype (behind `pf-preview-eval`): the solid pot only. Wireframe / debug /
 * ray-cast overlays keep the existing per-style path.
 */
export interface PreviewInstantDeps {
  uniformBuffer: GPUBuffer;
  styleParamBuffer: GPUBuffer;
  /** SceneManager.bgBuffers — {c1,c2,c3} = bindings 1..3, {bg1,bg2,bg3} = 5..7. */
  bgBuffers: { c1: GPUBuffer; c2: GPUBuffer; c3: GPUBuffer; bg1: GPUBuffer; bg2: GPUBuffer; bg3: GPUBuffer };
  format: GPUTextureFormat;
  depthFormat: GPUTextureFormat;
}

// Uniform-float offsets (mirror preview_main.wgsl vs_main / webgpu geometry buffer).
const OFF_CELLS_X = 16;
const OFF_CELLS_OUTER_Y = 17;
const OFF_INNER_Y = 27;
const OFF_BOTTOM_RINGS = 28;
const OFF_RIM_RINGS = 30;

export class PreviewInstantController {
  private readonly device: GPUDevice;
  private readonly deps: PreviewInstantDeps;
  private readonly computer: PreviewEvalComputer;

  private pipeline: GPURenderPipeline | null = null;
  private group0Layout: GPUBindGroupLayout | null = null;
  private group1Layout: GPUBindGroupLayout | null = null;
  private group0Bind: GPUBindGroup | null = null;
  private group1Bind: GPUBindGroup | null = null;

  private lastCountsKey = '';
  private ready = false;

  constructor(device: GPUDevice, deps: PreviewInstantDeps) {
    this.device = device;
    this.deps = deps;
    this.computer = new PreviewEvalComputer(device, deps.uniformBuffer, deps.styleParamBuffer);
  }

  /** Compile the (style-independent) render pipeline + both compute pipelines. Once. */
  async init(): Promise<void> {
    const D = this.device;

    // group 0: the 8 preview uniforms (superset of what the shader uses — StyleParams
    // at binding 4 is declared by preview_uniforms.wgsl even if this shader ignores it).
    this.group0Layout = D.createBindGroupLayout({
      label: 'preview-instant-g0',
      entries: Array.from({ length: 8 }, (_, binding) => ({
        binding,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' as const },
      })),
    });
    // group 1: position + normal storage buffers (vertex stage).
    this.group1Layout = D.createBindGroupLayout({
      label: 'preview-instant-g1',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' as const } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' as const } },
      ],
    });

    const module = D.createShaderModule({
      label: 'preview_instant.wgsl',
      code: ShaderManager.getInstance().getInstantPreviewWGSL(),
    });
    this.pipeline = await D.createRenderPipelineAsync({
      label: 'preview-instant',
      layout: D.createPipelineLayout({ bindGroupLayouts: [this.group0Layout, this.group1Layout] }),
      vertex: { module, entryPoint: 'vs_main' },
      fragment: {
        module,
        entryPoint: 'fs_main',
        targets: [{
          format: this.deps.format,
          blend: {
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: this.deps.depthFormat },
    });

    const b = this.deps.bgBuffers;
    this.group0Bind = D.createBindGroup({
      layout: this.group0Layout,
      entries: [
        { binding: 0, resource: { buffer: this.deps.uniformBuffer } },
        { binding: 1, resource: { buffer: b.c1 } },
        { binding: 2, resource: { buffer: b.c2 } },
        { binding: 3, resource: { buffer: b.c3 } },
        { binding: 4, resource: { buffer: this.deps.styleParamBuffer } },
        { binding: 5, resource: { buffer: b.bg1 } },
        { binding: 6, resource: { buffer: b.bg2 } },
        { binding: 7, resource: { buffer: b.bg3 } },
      ],
    });

    await this.computer.ensureCompiled();
    this.ready = true;
  }

  private countsFrom(f32: Float32Array): PreviewEvalCounts {
    return {
      cellsX: f32[OFF_CELLS_X],
      cellsOuterY: f32[OFF_CELLS_OUTER_Y],
      innerY: f32[OFF_INNER_Y],
      bottomRings: f32[OFF_BOTTOM_RINGS],
      rimRings: f32[OFF_RIM_RINGS],
    };
  }

  /**
   * Rebuild the index buffers if the resolution changed, then re-run the eval
   * passes (positions + normals) off the current uniforms. Call once per frame
   * BEFORE beginning the render pass. Cheap (GPU dispatch, no recompile).
   */
  updateAndDispatch(f32: Float32Array): void {
    if (!this.ready || !this.group1Layout) return;
    const counts = this.countsFrom(f32);
    const key = `${counts.cellsX}|${counts.cellsOuterY}|${counts.innerY}|${counts.bottomRings}|${counts.rimRings}`;
    if (key !== this.lastCountsKey) {
      const idx = buildPreviewEvalIndexBuffers(counts);
      this.computer.resize(idx.vertexCount, idx.seg, idx.uv, idx.nbr);
      this.lastCountsKey = key;
      const pos = this.computer.positionBuffer;
      const norm = this.computer.normalBuffer;
      this.group1Bind = (pos && norm)
        ? this.device.createBindGroup({
            layout: this.group1Layout,
            entries: [
              { binding: 0, resource: { buffer: pos } },
              { binding: 1, resource: { buffer: norm } },
            ],
          })
        : null;
    }
    this.computer.evaluate();
  }

  /** True once the pipeline + first index buffers are ready to draw. */
  get canDraw(): boolean {
    return this.ready && this.pipeline !== null && this.group0Bind !== null && this.group1Bind !== null;
  }

  /** Set the instant pipeline + bind groups and draw. Call inside the render pass. */
  draw(pass: GPURenderPassEncoder, vertexCount: number): void {
    if (!this.canDraw) return;
    pass.setPipeline(this.pipeline!);
    pass.setBindGroup(0, this.group0Bind!);
    pass.setBindGroup(1, this.group1Bind!);
    pass.draw(vertexCount);
  }

  dispose(): void {
    this.ready = false;
    this.computer.dispose();
    this.pipeline = null;
    this.group0Bind = null;
    this.group1Bind = null;
  }
}
