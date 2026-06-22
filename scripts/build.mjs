import { spawnSync } from 'node:child_process';
import path from 'node:path';

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const result = spawnSync(process.execPath, [nextBin, 'build'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NEXT_TURBOPACK_USE_WORKER: '0',
  },
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
