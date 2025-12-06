export const f = () => {
    try {
      const testAxis: Vec3 = [0, 0, 1];
      const rig = buildCameraRig(state, CAMERA_PADDING);
      const worldScale = Math.max(state.sceneRadius || 1, 1);
      const pA = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
      const pB = mulMat4Vec4(rig.viewProjection, (state.pivot?.[0] ?? 0) + testAxis[0] * worldScale, (state.pivot?.[1] ?? 0) + testAxis[1] * worldScale, (state.pivot?.[2] ?? 0) + testAxis[2] * worldScale);
        const dirNdc = ndcDirBetween(pA, pB);
        const ov_proj = [dirNdc[0], -dirNdc[1]];
        const ov_proj_len = Math.hypot(ov_proj[0], ov_proj[1]);
      if (ov_proj_len > 1e-9) {
        const ov_proj_unit = [ov_proj[0] / ov_proj_len, ov_proj[1] / ov_proj_len];
        // Compute basis-derived overlay using projection-based helper to
        // mirror what the runtime uses. This avoids sign confusion from
        // ad-hoc dot products and includes the inverted screen Y.
        const p = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] ?? 0, state.pivot?.[1] ?? 0, state.pivot?.[2] ?? 0);
        const pr = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] + state.displayCamRight[0] * worldScale, state.pivot?.[1] + state.displayCamRight[1] * worldScale, state.pivot?.[2] + state.displayCamRight[2] * worldScale);
        const pu = mulMat4Vec4(rig.viewProjection, state.pivot?.[0] + state.displayCamUp[0] * worldScale, state.pivot?.[1] + state.displayCamUp[1] * worldScale, state.pivot?.[2] + state.displayCamUp[2] * worldScale);
        const rdir = ndcDirBetween(p, pr);
        const udir = ndcDirBetween(p, pu);
        const r = [rdir[0], -rdir[1]];
        const u = [udir[0], -udir[1]];
        const ax = testAxis[0] * state.displayCamRight[0] + testAxis[1] * state.displayCamRight[1] + testAxis[2] * state.displayCamRight[2];
        const ay = testAxis[0] * state.displayCamUp[0] + testAxis[1] * state.displayCamUp[1] + testAxis[2] * state.displayCamUp[2];
        const ov_basis_unit = (() => {
          const ovx = ax * r[0] + ay * u[0];
          const ovy = ax * r[1] + ay * u[1];
          const len = Math.hypot(ovx, ovy);
          if (len < 1e-9) return [0, 0];
          return [ovx / len, ovy / len];
        })();
          const dotAlign = ov_basis_unit[0] * ov_proj_unit[0] + ov_basis_unit[1] * ov_proj_unit[1];
          if (dotAlign < 0) {
            state.displayCamRight = vec3Scale2(state.displayCamRight, -1);
            state.displayCamUp = vec3Scale2(state.displayCamUp, -1);
            emitDiagnostic('preview:display-basis-parity_flip', { dotAlign });
            flipped = true;
          }
        }
      }
    } catch (e) {
      /* ignore parity alignment failures */
    }
    const dot = vec3Dot(prevRight as Vec3, state.displayCamRight as Vec3);
};