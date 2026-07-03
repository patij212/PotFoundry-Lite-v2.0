import React from 'react';
import { DisclosureSeam } from '../primitives/DisclosureSeam';
import type { ParametricExportStats } from '../../../hooks/useParametricExport';
import type { ValidationSummary } from '../../../renderers/webgpu/parametric/types';
import './Certificate.css';

export interface CertificateProps {
  filename: string;
  stats: ParametricExportStats;
}

interface CheckItem {
  label: string;
  pass: boolean;
  detail?: string;
  warning?: string;
}

export const Certificate: React.FC<CertificateProps> = ({ filename, stats }) => {
  const vs = stats.validationSummary;

  // Build check items from validation summary
  const checks: CheckItem[] = [];
  if (vs) {
    checks.push({
      label: 'watertight',
      pass: vs.manifoldOk,
      warning: vs.manifoldOk ? undefined : vs.warnings[0],
    });
    checks.push({
      label: 'mesh valid',
      pass: vs.valid,
      // Use a distinct warning for the second failing check so both rows are informative
      warning: vs.valid ? undefined : (vs.warnings[1] ?? vs.warnings[0]),
    });
  }

  // Triangles check (always present)
  checks.push({
    label: `${stats.triangleCount.toLocaleString()} triangles`,
    pass: true,
  });

  // P95 error check (when present)
  if (vs?.p95PosErrorMm !== undefined) {
    checks.push({
      label: `${vs.p95PosErrorMm} mm p95 deviation`,
      pass: true,
    });
  }

  const canPrint = vs ? vs.valid && vs.manifoldOk : false;

  return (
    <div className="pf3-certificate">
      <div className="pf3-certificate__header">
        <span className="pf3-mono">{filename}.stl · {stats.fileSize}</span>
      </div>

      {vs && (
        <>
          <div className="pf3-certificate__checklist">
            {checks.map((check, idx) => (
              <div key={idx} className={`pf3-certificate__item pf3-certificate__item--${check.pass ? 'ok' : 'error'}`}>
                <span className="pf3-certificate__mark">{check.pass ? '✓' : '✗'}</span>
                <span className="pf3-mono pf3-certificate__label">{check.label}</span>
                {check.warning && (
                  <span className="pf3-certificate__warning">{check.warning}</span>
                )}
              </div>
            ))}
          </div>

          {canPrint && (
            <div className="pf3-certificate__subline">
              printable on any FDM/SLA slicer
            </div>
          )}

          <DisclosureSeam id="certificate-report" summary="full report ⌄">
            <div className="pf3-certificate__report">
              {Object.entries({
                // valid and manifoldOk are already shown as prominent checklist rows above
                degeneratesOk: vs.degeneratesOk,
                normalsOk: vs.normalsOk,
                triangleQualityOk: vs.triangleQualityOk,
                fidelityOk: vs.fidelityOk,
                seamOk: vs.seamOk,
                distortionOk: vs.distortionOk,
                minAngleDeg: vs.minAngleDeg,
                maxAspectRatio: vs.maxAspectRatio,
                p95PosErrorMm: vs.p95PosErrorMm,
                p999PosErrorMm: vs.p999PosErrorMm,
                maxFeatureDriftMm: vs.maxFeatureDriftMm,
                seamMaxGapMm: vs.seamMaxGapMm,
                p95StretchRatio: vs.p95StretchRatio,
              }).map(([key, value]) => {
                if (value === undefined) return null;
                const displayValue = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
                return (
                  <div key={key} className="pf3-certificate__report-line">
                    <span className="pf3-mono">{key}</span>
                    <span className="pf3-mono pf3-certificate__report-value">{displayValue}</span>
                  </div>
                );
              })}
            </div>
          </DisclosureSeam>
        </>
      )}

      {!vs && (
        <div className="pf3-certificate__checklist">
          <div className="pf3-certificate__item pf3-certificate__item--ok">
            <span className="pf3-certificate__mark">✓</span>
            <span className="pf3-mono pf3-certificate__label">{stats.triangleCount.toLocaleString()} triangles</span>
          </div>
        </div>
      )}
    </div>
  );
};
