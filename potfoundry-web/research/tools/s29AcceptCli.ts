// s29AcceptCli.ts — CLI entry for the S29 sink-guard self-test. RESEARCH ONLY.
// See the header of `s29PerpCli.ts`: `s29Accept.ts` is imported by the mesher driver and must have no
// module-scope side effects.
//
//   node_modules/.bin/esbuild research/tools/s29AcceptCli.ts --bundle --platform=node --format=cjs \
//     --outfile=research/bridge/out/_run_s29accept.cjs
//   node research/bridge/out/_run_s29accept.cjs --selftest
import { selftest } from './s29Accept';

process.exit(selftest() === 0 ? 0 : 1);
