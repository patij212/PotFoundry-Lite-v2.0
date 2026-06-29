/**
 * export3MF.schema.test.ts — Plan Task 3.3 (B): 3MF structural schema validation.
 *
 * Exports a REAL pot (`buildPotMesh`) to 3MF, unzips the package with JSZip, and
 * validates the emitted `3D/3dmodel.model` part as a 3MF Core document.
 *
 * XSD NOTE (recorded for the plan follow-up): validating against the *official*
 * 3MF Core XSD inside jsdom is impractical — jsdom's `DOMParser` performs no
 * schema validation, and the XSD-capable validators (libxmljs / xmllint) need
 * native bindings that are unavailable in the jsdom/Vitest worker. Rather than
 * vendor an XSD we cannot actually enforce, this test implements a STRONGER
 * STRUCTURAL validator than the prior substring checks (`export3MF.test.ts`):
 *
 *   1. WELL-FORMED — the model part parses via `DOMParser` with no `<parsererror>`.
 *   2. UNIT — the root `<model>` carries `unit="millimeter"` (correct mm scale).
 *   3. INDEX BOUNDS — every `<triangle>` v1/v2/v3 index is a non-negative integer
 *      strictly less than the declared `<vertex>` count (no dangling references).
 *   4. RELATIONSHIP WIRING — the `_rels/.rels` Relationship `Target` resolves to an
 *      actual part present in the ZIP (the `3D/3dmodel.model` we validated).
 *   5. BUILD/OBJECT RESOLUTION — every `<build><item objectid>` references an
 *      `<object id>` that is actually defined in `<resources>`.
 *
 * These cover the failure modes a real XSD would catch for THIS schema profile
 * (malformed XML, wrong unit, out-of-range indices, broken part references,
 * unresolved build items) while running headless in CI without native deps.
 *
 * Reference: `src/geometry/exporters/export3MF.ts` (`exportTo3MF`),
 * `src/geometry/meshBuilder.ts` (`buildPotMesh`).
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { exportTo3MF } from './export3MF';
import { buildPotMesh } from '../meshBuilder';
import { DEFAULT_DIMENSIONS } from '../types';
import type { PotDimensions, StyleId } from '../types';

const STYLE: StyleId = 'SuperellipseMorph';
const DIMS: PotDimensions = { ...DEFAULT_DIMENSIONS };
const MODEL_PART = '3D/3dmodel.model';

/** Build a real pot, export to 3MF, return the unzipped package. */
async function exportRealPotZip(): Promise<JSZip> {
  const { mesh } = buildPotMesh(DIMS, {}, STYLE, {});
  // Guard against a vacuous validation on a degenerate mesh.
  expect(mesh.triangleCount).toBeGreaterThan(1000);
  const blob = await exportTo3MF(mesh, { name: 'SchemaPot', unit: 'millimeter' });
  return JSZip.loadAsync(blob);
}

/** Parse an XML string in jsdom and surface any well-formedness error. */
function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const err = doc.querySelector('parsererror');
  if (err) {
    throw new Error(`XML parse error: ${err.textContent ?? 'unknown'}`);
  }
  return doc;
}

describe('export3MF.schema — structural 3MF Core validation of a real pot', () => {
  it('emits a well-formed model part (DOMParser, no parsererror)', async () => {
    const zip = await exportRealPotZip();
    const model = zip.file(MODEL_PART);
    expect(model).not.toBeNull();

    const xml = await model!.async('string');
    // parseXml throws on a parsererror node; reaching the assertion = well-formed.
    const doc = parseXml(xml);
    expect(doc.documentElement.tagName).toBe('model');
  });

  it('declares unit="millimeter" on the root <model>', async () => {
    const zip = await exportRealPotZip();
    const xml = await zip.file(MODEL_PART)!.async('string');
    const doc = parseXml(xml);

    expect(doc.documentElement.getAttribute('unit')).toBe('millimeter');
  });

  it('every <triangle> v-index is in [0, vertexCount)', async () => {
    const zip = await exportRealPotZip();
    const xml = await zip.file(MODEL_PART)!.async('string');
    const doc = parseXml(xml);

    const vertexCount = doc.getElementsByTagName('vertex').length;
    expect(vertexCount).toBeGreaterThan(0);

    const triangles = doc.getElementsByTagName('triangle');
    expect(triangles.length).toBeGreaterThan(0);

    // Validate in a single pass and assert ONCE. A per-element expect() over
    // ~57k triangles is ~870k assertions, which blows the default 5s test
    // timeout (and yields a useless failure message). Record the first offender.
    let firstBad: string | null = null;
    for (let i = 0; i < triangles.length && firstBad === null; i++) {
      const tri = triangles[i];
      for (const attr of ['v1', 'v2', 'v3'] as const) {
        const raw = tri.getAttribute(attr);
        const idx = Number(raw);
        if (raw === null || !Number.isInteger(idx) || idx < 0 || idx >= vertexCount) {
          firstBad = `triangle[${i}].${attr}=${raw} (vertexCount=${vertexCount})`;
          break;
        }
      }
    }
    expect(firstBad).toBeNull();
  }, 60_000);

  it('_rels Target resolves to the model part present in the package', async () => {
    const zip = await exportRealPotZip();
    const relsFile = zip.file('_rels/.rels');
    expect(relsFile).not.toBeNull();

    const relsXml = await relsFile!.async('string');
    const relsDoc = parseXml(relsXml);

    const rels = relsDoc.getElementsByTagName('Relationship');
    expect(rels.length).toBeGreaterThan(0);

    // At least one relationship must target the 3D model part, and that target
    // must actually exist in the ZIP. 3MF targets are absolute ('/3D/...').
    let resolvedModelRel = false;
    for (let i = 0; i < rels.length; i++) {
      const target = rels[i].getAttribute('Target');
      expect(target).not.toBeNull();
      const normalized = target!.replace(/^\//, ''); // ZIP entries are relative
      if (normalized === MODEL_PART) {
        expect(zip.file(normalized)).not.toBeNull();
        resolvedModelRel = true;
      }
    }
    expect(resolvedModelRel).toBe(true);
  });

  it('<build><item objectid> resolves to a defined <object id>', async () => {
    const zip = await exportRealPotZip();
    const xml = await zip.file(MODEL_PART)!.async('string');
    const doc = parseXml(xml);

    // Collect every object id defined in <resources>.
    const objectIds = new Set<string>();
    const objects = doc.getElementsByTagName('object');
    expect(objects.length).toBeGreaterThan(0);
    for (let i = 0; i < objects.length; i++) {
      const id = objects[i].getAttribute('id');
      expect(id).not.toBeNull();
      objectIds.add(id!);
    }

    // Every build item must point at one of those ids.
    const items = doc.getElementsByTagName('item');
    expect(items.length).toBeGreaterThan(0);
    for (let i = 0; i < items.length; i++) {
      const ref = items[i].getAttribute('objectid');
      expect(ref).not.toBeNull();
      expect(objectIds.has(ref!)).toBe(true);
    }
  });
});
