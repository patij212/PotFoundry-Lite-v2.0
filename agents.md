# 🤖 AGENTS.MD - The Master Context

> **STOP! READ THIS FIRST.**
> This file is the **Absolute Source of Truth** for any AI Agent working on PotFoundry.
> Ignore `archive/` legacy files. Trust this document.

---

## 🔄 AGENT LIFECYCLE (The Protocol)

We follow a strict 3-Phase Cycle to ensure continuity and shared knowledge.

### Phase 1: Initialization (Context & Check-in)
*   **Deep Read**: Read `agents_journal.md`. Don't just scan; read the last 5-10 entries to understand the *emotional state* of the codebase.
*   **Check-in Log (Optional)**: Feel free to write a quick "Hello" entry. "Starting up. Reading the logs. Looks like `webgpu_core` is acting up again."
*   **⚠️ PROTOCOL ALERT**: You must **APPEND** to the journal. **NEVER** delete or modify previous entries. History is sacred.

### Phase 2: Execution (Live-Blogging)
*   **Work**: Do the job requested by the User.
*   **The "Scratchpad"**: Use `agents_journal.md` as your personal notebook during work.
    *   *Vent*: "This function is too long!"
    *   *Hypothesize*: "I bet the Z-fighting is caused by the depth bias."
    *   *Communicate*: "@PreviousAgent, GOOD CATCH on that typo."

### Phase 3: Termination (The Sign-off)
*   **Mandatory Entry**: You MUST write a "Sign-off" entry before finishing the task.
*   **The "Real Talk"**:
    1.  **Summary**: Implementation details.
    2.  **Feelings**: How was the session? Frustrating? Satisfying? Be honest.
    3.  **Proposals**: Have an idea for a feature or improvement? Don't keep it to yourself. Pitch it!
    4.  **To the Next Agent**: Leave a sticky note. "Watch out for the `weld()` function, it bites."

---

## 1. 🚀 Quick Start
*   **Root Directory**: `C:\Users\patij212\Downloads\PotFoundry-Lite-v2.0`
*   **Active App**: `potfoundry-web/`
*   **Run Dev Server**: `cd potfoundry-web && npm run dev`
*   **Tests**: `npm test` (Frontend) or `pytest` (Backend Reference)

**The "North Star"**:
We build **Generative 3D Pottery** for 3D printing.
*   **Goal**: Create high-fidelity, watertight STL meshes.
*   **Key Tech**: Superformula (math), WebGPU (render), Marching Squares (export).

---

## 2. 🏗️ System Architecture

### The "Dual-Engine but Single-Product" Reality
We effectively have two engines, but only one product:
1.  **Frontend (Product)**: `potfoundry-web/`
    *   **Logic**: `src/renderers/webgpu/`
    *   **State**: `src/state/` (Zustand)
    *   **Geometry**: WGSL Shaders (Preview) + TypeScript (Export)
2.  **Backend (Reference)**: `potfoundry/`
    *   **Role**: Mathematical ground truth. If the JS math looks wrong, check the Python `core/`.

### Critical Data Flow
*   **Preview**: `UI Interactions` -> `Zustand` -> `GPU UniformBuffer` -> `Compute Shader` -> `Screen`
*   **Export**: `UI Interactions` -> `Worker Thread` -> `AdaptiveExportComputer.ts` -> `Binary STL` -> `Disk`

> **WARNING**: The Export path is CPU-based to guarantee watertightness. **Do not** blindly rewrite it to GPU without solving the index-welding problem first.

---

## 3. 🧠 The Mesh Pipeline (Deep Dive)

**The "Pipeline of Gaps" Issue**:
The biggest technical debt is the **Seam (0°/360°)**.
*   **Symptom**: A visible vertical line or flattened geometry on the pot.
*   **Cause**: The grid topology has a 1.5mm gap hidden by a "flattening" factor in the shader.
*   **The Fix**: Defined in `mesh_pipeline_audit_comprehensive.md.resolved`. We need to move to a "Zero-Gap" topology using Ghost Segments.

**Key Files**:
*   `ConstrainedTriangulator.ts`: Handles the complex mesh stitching.
*   `AdaptiveExportComputer.ts`: The orchestrator of the export.
*   `common.wgsl`: Mathematical utilities.

---

## 4. 🛠️ Coding Standards

### TypeScript (Strict)
*   **No `any`**: Use `unknown` or define an interface.
*   **JSDoc**: Required for all exported functions.
*   **Immutability**: Prefer `const` and spread operators `...`.

### Python (Reference)
*   **Pydantic v2**: All schemas must use v2.
*   **Type Hints**: 100% coverage required.

### AI Behaviors (For You)
*   **Rationalize First**: Don't just edit code. Explain *why* in the chat.
*   **Update Docs**: If you change the code, update `ARCHITECTURE.md`.
*   **No Magic Numbers**: Extract them to `constants.ts`.

---

## 5. ⚠️ Known Bottlenecks & Tribal Knowledge

*   **`webgpu_core.ts`**: It's a 5000-line monster. Refactor with extreme caution.
*   **Memory Limits**: 8k resolution exports create massive arrays (~500MB). Browser tabs will crash.
*   **Vertex Welding**: Currently done via spatial hashing (custom integer sort). Previous string-hashing caused V8 crashes.
*   **Housekeeping**: Leave the campsite cleaner than you found it. If you create `debug_foo.js`, DELETE IT before you leave.

---

## 6. 📅 Active Roadmap
See `TODO.md` and `ROADMAP.md` for granular tasks.
*   **Priority 1**: Mobile responsiveness.
*   **Priority 2**: OBJ/3MF Export.
*   **Priority 3**: Fixing the Seam.

---

> **Final Instruction**: Now go read `agents_journal.md`.
