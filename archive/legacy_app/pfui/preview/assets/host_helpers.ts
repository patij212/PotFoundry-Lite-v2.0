export const assertHostHelpersPresent = (root: any = (typeof window !== 'undefined' ? window : globalThis)): boolean => {
  try {
    const c = root.__pf_webgpu_camera_controller as any | undefined;
    try { console.debug('[WebGPUPreview] assertHostHelpersPresent:', !!c, Object.keys(c || {})); } catch (e) { /* ignore */ }
    if (!c || !c.helpers) return false;
    // Check for required helpers explicitly to avoid false-positive controller stubs
    const required = [
      'quaternionFromAxisAngle',
      'multiplyQuaternions',
      'invertQuaternion',
      'axisAngleFromQuaternion',
      'basisFromQuaternion',
      'cameraAxisToWorld',
      'syncAnglesFromBasis',
    ];
    for (const name of required) {
      if (typeof c.helpers[name] !== 'function') return false;
    }
    return true;
  } catch (err) {
    return false;
  }
};

export const requireHostController = (root: any = (typeof window !== 'undefined' ? window : globalThis)) => {
  const c = root.__pf_webgpu_camera_controller as any | undefined;
  if (!c || !c.helpers) {
    throw new Error('[WebGPU Preview] Host CameraController with helpers is required.');
  }
  return c;
};

export const requireHostHelper = (name: string, root: any = (typeof window !== 'undefined' ? window : globalThis)) => {
  const c = requireHostController(root);
  const fn = (c.helpers as any)[name];
  if (typeof fn !== 'function') throw new Error(`[WebGPU Preview] Required host helper '${name}' is missing`);
  return fn as Function;
};
