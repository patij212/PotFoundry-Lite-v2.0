// Quick runtime test for ortho->perspective mapping
const CAMERA_DISTANCE_FALLOFF = 2.2;
const BASE_FOV = (50 * Math.PI) / 180;

function toDeg(r) { return r*180/Math.PI }

function computeNewZoomFromOrtho(paddedHalfWidth, paddedHalfHeight, zoomOrtho, aspect) {
  const halfFovY = Math.max(BASE_FOV * 0.5, 1e-4);
  const halfFovX = Math.atan(Math.tan(halfFovY) * aspect);
  const halfHeightOrtho = paddedHalfHeight / Math.max(zoomOrtho, 1e-3);
  const halfWidthOrtho = paddedHalfWidth / Math.max(zoomOrtho, 1e-3);
  const isHeightLimiting = paddedHalfHeight >= paddedHalfWidth / aspect;
  const desiredDistance = isHeightLimiting ? halfHeightOrtho / Math.max(Math.tan(halfFovY), 1e-6) : halfWidthOrtho / Math.max(Math.tan(halfFovX), 1e-6);
  const dV = paddedHalfHeight / Math.max(Math.tan(halfFovY), 1e-6);
  const dH = paddedHalfWidth / Math.max(Math.tan(halfFovX), 1e-6);
  const baseDistanceForMapping = Math.max(dV, dH) * CAMERA_DISTANCE_FALLOFF;
  const newZoom = Math.max(1e-3, baseDistanceForMapping / Math.max(desiredDistance, 1e-6));
  // Simulate correction: compute actualHalfHeight/width for perspective with this zoom
  const perspectiveDistance = baseDistanceForMapping / newZoom; // as buildCameraRig computes
  const actualHalfHeight = perspectiveDistance * Math.tan(halfFovY);
  const actualHalfWidth = perspectiveDistance * Math.tan(halfFovX);
  let correctedZoom = newZoom;
  // Iteratively refine to converge on the desired axis half size
  const maxIter = 6;
  for (let it = 0; it < maxIter; it += 1) {
    const perspectiveDistanceIt = baseDistanceForMapping / correctedZoom;
    const actualHalfHeightIt = perspectiveDistanceIt * Math.tan(halfFovY);
    const actualHalfWidthIt = perspectiveDistanceIt * Math.tan(halfFovX);
    const axisValueIt = isHeightLimiting ? actualHalfHeightIt : actualHalfWidthIt;
    const desiredAxis = isHeightLimiting ? halfHeightOrtho : halfWidthOrtho;
    if (axisValueIt <= 1e-6) break;
    const correctionIt = Math.max(1e-6, desiredAxis / axisValueIt);
    if (Math.abs(1 - correctionIt) < 1e-3) break;
    correctedZoom = correctedZoom * correctionIt;
  }
  return { newZoom, correctedZoom, desiredDistance, dV, dH, baseDistanceForMapping, halfFovY, halfFovX, isHeightLimiting };
}

function test(paddedHalfWidth, paddedHalfHeight, zoomOrtho=1.0, aspect=1.0) {
  const out = computeNewZoomFromOrtho(paddedHalfWidth, paddedHalfHeight, zoomOrtho, aspect);
  console.log('paddedHalfWidth', paddedHalfWidth, 'paddedHalfHeight', paddedHalfHeight, 'zoomOrtho', zoomOrtho, 'aspect', aspect);
  console.log('isHeightLimiting', out.isHeightLimiting, 'halfFovY', out.halfFovY, 'halfFovX', out.halfFovX);
  console.log('dV', out.dV, 'dH', out.dH, 'baseDistance', out.baseDistanceForMapping, 'desiredDistance', out.desiredDistance, 'newZoom', out.newZoom, 'correctedZoom', out.correctedZoom);
  // Map back from perspective -> ortho using same math to verify inverse mapping
  const halfFovY = out.halfFovY;
  const halfFovX = out.halfFovX;
  const targetHalfHeight = paddedHalfHeight / zoomOrtho;
  // Simulate perspective rig with corrected zoom
  const perspectiveDistance = out.baseDistanceForMapping / out.correctedZoom;
  const halfHeightPers = perspectiveDistance * Math.tan(halfFovY);
  const halfWidthPers = perspectiveDistance * Math.tan(halfFovX);
  // Compute resulting ortho zoom using the limiting axis
  let mappedOrthozoom = 1.0;
  if (out.isHeightLimiting) {
    mappedOrthozoom = paddedHalfHeight / halfHeightPers;
  } else {
    mappedOrthozoom = paddedHalfWidth / halfWidthPers;
  }
  console.log('After mapping ortho->persp->ortho: mappedOrthozoom', mappedOrthozoom, 'original zoomOrtho', zoomOrtho);
  console.log('----');
}

console.log('Examples');
// Example: tall pot
test(30, 60, 1.0, 1.0);
// example: wide pot
test(60, 30, 1.0, 1.5);
// different zoom levels
test(60, 30, 2.0, 1.5);
// small pot
test(10, 10, 1.0, 1.0);

console.log('Done');
