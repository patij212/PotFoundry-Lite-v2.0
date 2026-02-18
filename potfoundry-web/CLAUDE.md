# PotFoundry Web

3D pottery design tool — TypeScript/React SPA on Cloudflare Pages.
Dual WebGPU (primary) / WebGL (fallback) renderer. Auth via Supabase, payments via Stripe.

## Commands

```bash
npm run dev           # Dev server → localhost:3000
npm run build         # Production build → dist/
npm run deploy        # build + wrangler pages deploy dist
npm run dev:wrangler  # Local Wrangler Pages dev (edge functions)
npm run typecheck     # tsc --noEmit
npm run lint          # ESLint — 0 max-warnings (any warning = CI failure)
npm run format        # Prettier
npm run test          # Vitest unit tests (jsdom)
npm run test:watch    # Vitest watch mode
npm run test:coverage # Vitest + v8 coverage
npm run test:e2e      # Playwright E2E
```

## Environment Variables

```
VITE_SUPABASE_URL              # Supabase project URL
VITE_SUPABASE_ANON_KEY         # Supabase anon key
VITE_STRIPE_PRICE_PRO_MONTHLY  # Stripe monthly price ID
VITE_STRIPE_PRICE_PRO_YEARLY   # Stripe yearly price ID
```

Without Supabase vars, auth is disabled and all exports are allowed (dev mode).

## Architecture

```
src/
  main.tsx                  # Entry — installs ConsolePatch before anything else
  App.tsx                   # Root component
  renderers/
    factory.ts              # Auto-selects WebGPU → WebGL, handles crash recovery
    webgpu/                 # WGSL compute shaders, parametric export pipeline
    webgl/                  # Three.js fallback (lazy-loaded)
  state/
    store.ts                # Zustand store — persists geometry/style/mesh/appearance
    slices/                 # geometry, style, ui, mesh, appearance, performance
  context/
    AuthContext.tsx          # Supabase auth state + isPro hook
    ControllerContext.tsx    # Renderer controller ref
    LibraryContext.tsx       # Design library
  hooks/
    useExportTier.ts         # Tier gating + export recording via Supabase RPC
  services/
    supabase.ts             # Client (may be null — always check isSupabaseConfigured())
    stripe.ts               # Price IDs + tier feature config
  ui/
    AppUI.tsx               # Main layout
    controls/               # DimensionControls, StyleControls, MeshControls, etc.
    auth/                   # AuthModal, UserMenu, SettingsModal
    pricing/                # PricingModal
    layout/                 # Sidebar, Toolbar, StatusBar, MobileBottomSheet
    debug/                  # ConsoleOverlay (reads from ConsolePatch intercept)
  utils/geometry/           # CDT triangulation, mesh stitching, chain constraints
```

## State Management

Use named selector hooks — not raw `useAppStore` — to avoid unnecessary re-renders:

```ts
useGeometry(), useStyle(), useMesh(), useAppearance(), usePerformance()
useGeometryActions(), useStyleActions(), useMeshActions(), etc.
```

Only `geometry`, `style`, `mesh`, `appearance` are persisted to localStorage.
`ui` and `performance` slices are transient (reset on reload).

## Key Gotchas

**Renderer selection order:**
1. `forceRenderer` API arg
2. URL param `?renderer=webgl|webgpu` (emergency override when UI inaccessible)
3. `localStorage['pf-preferred-renderer']` (user Settings preference)
4. Auto-detect (WebGPU preferred, WebGL fallback)

Auto-recovery on GPU crash: `sessionStorage['pf-gpu-recovery']` prevents reload loops.

**Supabase null safety:** `supabase` client in `services/supabase.ts` can be `null`.
Always call `isSupabaseConfigured()` before any `supabase.*` call.

**Export tier gating:** `checkExportAllowed()` in `useExportTier.ts` is client-side.
The `increment_exports` Supabase RPC uses `auth.uid()` server-side — users can only
increment their own count. Free tier: 10 exports/month, 84×42 max resolution.

**ConsolePatch:** Installed in `main.tsx` before React mounts. All `console.*` output
is intercepted for the debug overlay. Don't assume native console behaviour in dev.

**ESLint strict:** 0 max-warnings policy. Any ESLint warning fails `npm run lint`.

**WGSL alignment:** `vec3<f32>` requires 16-byte alignment in compute shader structs.
Missing padding causes silent data corruption in the export pipeline.

## Testing

- Unit tests: `src/**/*.test.ts` — Vitest + jsdom + @testing-library/react
- Setup file: `src/test/setup.ts`
- E2E: `playwright.config.ts`
- Coverage thresholds are commented out in `vite.config.ts` (can be re-enabled)

## Deployment

Hosted on Cloudflare Pages. Wrangler handles edge functions for auth callbacks.
`npm run deploy` builds and pushes. Env vars set in Cloudflare Pages dashboard.
