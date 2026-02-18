// PreToolUse hook: block Claude from editing .env files
let d = '';
process.stdin.on('data', c => d += c).on('end', () => {
  let input;
  try { input = JSON.parse(d); } catch { process.exit(0); }

  const f = input.tool_input?.file_path || input.file_path || '';

  if (/\.env(\.|$)/.test(f) || f.endsWith('.env')) {
    console.error(`BLOCKED: .env files are protected. Refusing to edit: ${f}`);
    process.exit(2);
  }
  process.exit(0);
});
