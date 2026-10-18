const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const output = mkdtempSync(join(tmpdir(), 'grape-eligibility-'));
try {
  const compile = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', 'app/lib/eligibility.ts', 'app/lib/public-status.ts', '--esModuleInterop', '--outDir', output, '--module', 'commonjs', '--target', 'ES2020', '--skipLibCheck'], { stdio: 'inherit' });
  if (compile.status !== 0) process.exitCode = compile.status || 1;
  else process.exitCode = spawnSync(process.execPath, ['--test', 'tests/eligibility.test.cjs', 'tests/public-status.test.cjs'], { stdio: 'inherit', env: { ...process.env, ELIGIBILITY_MODULE: join(output, 'eligibility.js'), PUBLIC_STATUS_MODULE: join(output, 'public-status.js'), NODE_PATH: join(process.cwd(), 'node_modules') } }).status ?? 1;
} finally { rmSync(output, { recursive: true, force: true }); }
