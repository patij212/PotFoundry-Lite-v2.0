# How to Add a New Pot Style

This architecture uses a **Registry-First** approach. The `src/styles/registry.ts` file is the single source of truth.

## 1. Register the Style
Open `src/styles/registry.ts` and add a new entry to the `STYLE_REGISTRY` object.

```typescript
export const STYLE_REGISTRY: Record<string, StyleSchema> = {
    // ... existing styles
    MyNewStyle: {
        id: 14, // Increment the last ID
        shaderName: 'style_my_new_style', // Function name in WGSL
        name: 'My New Style',
        description: 'Description for the UI tooltip.',
        params: {
            // Define sliders for the UI
            m_scale: { type: 'float', min: 0, max: 10, default: 5, label: 'Scale' },
            // ...
        },
        advancedParams: {
            // Optional advanced sliders
        }
    }
}
```

## 2. Implement the Shader (GPU)
Open `src/assets/pot_preview.wgsl`.
1.  Prepend your new function with the name defined in the registry (e.g., `style_my_new_style`).
2.  Implement the radius modulation logic.

```wgsl
fn style_my_new_style(theta: f32, z: f32, r0: f32, H: f32, style_val: f32, style_param: f32, ...) -> f32 {
    // Your math here
    return r0 * (1.0 + ...);
}
```

3.  Add it to the `style_radius` dispatch function (around line 1150).
    *   **Note:** The constants `STYLE_MY_NEW_STYLE` are **automatically generated** from the registry key you added (converted to `SCREAMING_SNAKE_CASE`).

```wgsl
    if (style_id == STYLE_MY_NEW_STYLE) {
        return style_my_new_style(...);
    }
```

4.  Also update `style_radius_zero` and `style_radius_tau` similarly.

## 3. Implement CPU Logic (Export/Geometry)
Open `src/geometry/styles.ts` and add the equivalent TypeScript implementation.
This ensures the exported 3D model matches the screen preview.

```typescript
export function rOuterMyNewStyle(theta: number, z: number, r0: number, H: number, opts: StyleOptions): number {
    // Duplicate the math from WGSL
}

export function rOuterMyNewStyleVec(...) {
    // Vectorized version for performance
}
```

## 4. Updates Types (Parameter Interface)
Open `src/geometry/types.ts`.
1.  Define a specific interface for your style's parameters if you need strict typing in other parts of the app.
2.  Update `StyleOptions` union if necessary.

## 5. Verify via Typecheck
Run `npm run typecheck` to ensure all maps and types align.
The helper `src/webgpu_core.ts` automatically picks up the new ID and shader function name from the registry, so no changes are needed there!
