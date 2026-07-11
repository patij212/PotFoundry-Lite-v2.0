import type { ExportFormat } from '../../../geometry/stlExport';

export const FORMAT_OPTIONS: ReadonlyArray<{ value: ExportFormat; label: string }> = [
  { value: 'stl', label: 'STL' },
  { value: '3mf', label: '3MF' },
  { value: 'obj', label: 'OBJ' },
];

export function normalizeExportFormat(format: unknown): ExportFormat {
  if (format === '3mf' || format === 'obj') return format;
  return 'stl';
}

export function formatExportLabel(format: unknown): string {
  return normalizeExportFormat(format).toUpperCase();
}
