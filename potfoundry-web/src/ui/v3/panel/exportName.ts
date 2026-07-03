export function deriveDefaultFilename(styleName: string, H: number): string {
  const kebab = styleName
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
    .replace(/^-+|-+$/g, '');
  return `${kebab}-${Math.round(H)}`;
}

export function estimateExport(nTheta: number, nZ: number): { tris: number; bytes: number } {
  const tris = nTheta * nZ * 2;
  return { tris, bytes: 84 + tris * 50 };
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

/**
 * Canonical fidelity preset definitions, shared between ExportTab and ExportFooter.
 * Exported so that `deriveFidelityKey` and ExportTab's UI can use the same source.
 */
export const FIDELITIES = [
  { key: 'draft',    name: 'Draft',    purpose: 'quick look',            nTheta: 512,  nZ: 256,  previewNTheta: 256,  previewNZ: 128  },
  { key: 'standard', name: 'Standard', purpose: 'everyday prints',       nTheta: 1024, nZ: 512,  previewNTheta: 512,  previewNZ: 256  },
  { key: 'high',     name: 'High',     purpose: 'print-ready · 0.20 mm', nTheta: 2048, nZ: 1024, previewNTheta: 1024, previewNZ: 512  },
  { key: 'ultra',    name: 'Ultra',    purpose: 'exhibition · 0.05 mm',  nTheta: 4096, nZ: 2048, previewNTheta: 2048, previewNZ: 1024 },
] as const;

/** Minimal mesh resolution shape needed to identify a fidelity preset. */
export interface MeshResolution {
  export_n_theta: number;
  export_n_z: number;
  preview_n_theta: number;
  preview_n_z: number;
}

/**
 * Returns the active fidelity preset key for a given mesh resolution.
 * Returns `'custom'` when no preset matches.
 */
export function deriveFidelityKey(mesh: MeshResolution): string {
  return (
    FIDELITIES.find(
      (f) =>
        f.nTheta        === mesh.export_n_theta  &&
        f.nZ            === mesh.export_n_z      &&
        f.previewNTheta === mesh.preview_n_theta &&
        f.previewNZ     === mesh.preview_n_z
    )?.key ?? 'custom'
  );
}
