// PostToolUse hook: run ESLint on any .ts/.tsx file Claude edits
// Exit code non-zero = warn Claude; exit code 2 = block (not used here, just warn)
let d = '';
process.stdin.on('data', c => d += c).on('end', () => {
  let input;
  try { input = JSON.parse(d); } catch { process.exit(0); }

  // Handle both PreToolUse and PostToolUse input shapes
  const f = input.tool_input?.file_path || input.file_path || '';

  if (!/\.(ts|tsx)$/.test(f)) process.exit(0);

  const { spawnSync } = require('child_process');
  const r = spawnSync('npx', ['eslint', f, '--max-warnings=0'], {
    stdio: 'inherit',
    shell: true,
  });
  process.exit(r.status || 0);
});
