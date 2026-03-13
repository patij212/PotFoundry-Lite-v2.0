import manager from './MessageManager';

let globalErrorCaptureInstalled = false;

function installGlobalErrorCapture() {
  if (globalErrorCaptureInstalled || typeof window === 'undefined') {
    return;
  }
  globalErrorCaptureInstalled = true;
  window.addEventListener('error', (event: ErrorEvent) => {
    try {
      const message = String(event?.message ?? event?.error ?? 'unknown error');
      const context = {
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      };
      const signatureParts = [
        message,
        event?.filename ?? '',
        String(event?.lineno ?? ''),
        String(event?.colno ?? ''),
        typeof event?.error === 'object' && event?.error ? String((event.error as Error).stack ?? '') : '',
      ];
      const signature = signatureParts.filter(Boolean).join('|');
      manager.error('WINDOW_ERROR', message, context, signature);
    } catch (err) {
      /* best-effort */
    }
  });

  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try {
      const reason = e?.reason;
      const message = String((reason as Error)?.message ?? reason ?? 'unknown rejection');
      const signature = typeof reason === 'object' && reason ? String((reason as Error).stack ?? reason) : message;
      manager.critical('UNHANDLED_PROMISE_REJECTION', message, undefined, signature);
    } catch (err) {
      /* best-effort */
    }
  });
}

export function installWebGpuCapture(device: GPUDevice) {
  installGlobalErrorCapture();
  // Device lost
  // Device lost
  device.lost.then((info) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GPUDeviceLostInfo.reason not in all @webgpu/types versions
      const reason = (info as any)?.reason;
      if (reason === 'destroyed') {
        manager.debug('WGPU_DEVICE_DESTROYED', 'Device destroyed intentionally');
      } else {
        manager.critical('WGPU_DEVICE_LOST', `Device lost: ${info?.message ?? reason ?? 'unknown'}`, { reason });
      }
    } catch (e) {
      // ignore
    }
  }).catch(() => { });

  // uncaptured errors
  device.addEventListener('uncapturederror', (ev: GPUUncapturedErrorEvent) => {
    const err = ev?.error;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GPUError subtypes don't expose .name consistently
    const kind = (err as any)?.name || 'GPUError';
    manager.error('WGPU_UNCAPTURED_ERROR', `${String(kind)}: ${String(err?.message ?? err)}`, { name: kind });
  });

}

export async function withValidationScope<T>(device: GPUDevice, label: string, fn: () => Promise<T> | T) {
  try {
    device.pushErrorScope('validation');
  } catch (err) {
    // some implementations may not support it
  }
  try {
    const r = await fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- popErrorScope returns GPUError | null, typed loosely to handle cross-impl variation
    let err = null as any;
    try { err = await device.popErrorScope(); } catch { err = undefined; }
    if (err) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- GPUError.message access on loosely-typed popErrorScope result
      manager.error('WGPU_VALIDATE', `[${label}] ${String((err as any)?.message ?? err)}`, { label });
    }
    return r;
  } catch (e) {
    try { await device.popErrorScope(); } catch { };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Accessing .message on unknown caught error
    manager.error('WGPU_VALIDATE_THROW', `[${label}] ${String((e as any)?.message ?? e)}`);
    return undefined;
  }
}

export async function createShaderModule(device: GPUDevice, code: string, label?: string) {
  const module = device.createShaderModule({ code, label });
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- getCompilationInfo not in all @webgpu/types versions
    const info: any = await (module as any).getCompilationInfo?.();
    if (info && Array.isArray(info.messages)) {
      let warnCount = 0;
      for (const m of info.messages) {
        const sig = `${m.type}:${m.lineNum}:${m.linePos}:${m.message}`;
        if (m.type === 'error') {
          manager.error('WGPU_SHADER_ERROR', fmtShaderMsg(label, m), { stageLabel: label, line: m.lineNum, pos: m.linePos });
        } else if (m.type === 'warning') {
          // Skip known-harmless "unreachable code" warnings from shader optimization
          if (m.message && m.message.includes('code is unreachable')) {
            continue;
          }
          warnCount++;
          manager.info('WGPU_SHADER_WARN', fmtShaderMsg(label, m), undefined, sig);
        } else {
          manager.debug('WGPU_SHADER_INFO', fmtShaderMsg(label, m), undefined, sig);
        }
      }
    }
  } catch {
    // ignore missing getCompilationInfo
  }
  return module;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Shader compilation message format varies across implementations
function fmtShaderMsg(label: string | undefined, m: any) {
  const loc = (m.lineNum != null) ? `:${m.lineNum}:${m.linePos ?? 0}` : '';
  return `[${label ?? 'shader'}${loc}] ${m.message}`;
}
