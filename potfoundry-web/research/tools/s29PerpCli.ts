// s29PerpCli.ts — CLI entry for the S29 perpendicular-ruler validation. RESEARCH ONLY.
//
// THIS FILE EXISTS SO THAT `s29Perp.ts` HAS NO MODULE-SCOPE SIDE EFFECTS. `s29Perp.ts` is imported
// (transitively, via `s29Accept.ts`) by `research/bridge/_strataConformBisect.test.ts` — the mesher driver
// — so anything it runs at import time runs on every mesh. An `argv`-inspecting `process.exit` there would
// let a stray `--validate` on a vitest command line terminate a 90-minute run with no diagnostic.
//
//   node_modules/.bin/esbuild research/tools/s29PerpCli.ts --bundle --platform=node --format=cjs \
//     --outfile=research/bridge/out/_run_s29perp.cjs
//   node research/bridge/out/_run_s29perp.cjs --validate
import { validate } from './s29Perp';

process.exit(validate() === 0 ? 0 : 1);
