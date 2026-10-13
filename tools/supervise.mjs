import { spawn } from 'node:child_process';
let child,
  stopping = false,
  crashes = 0;
function start() {
  child = spawn(process.execPath, ['--import', 'tsx', 'packages/server/src/index.ts'], {
    stdio: 'inherit',
    env: process.env,
  });
  const launched = Date.now();
  child.on('exit', (code) => {
    if (stopping) return;
    if (code === 0) process.exit(0);
    crashes = Date.now() - launched > 30000 ? 0 : crashes + 1;
    const delay = Math.min(10000, 1000 * crashes);
    console.error(`Server exited (${code}); restart in ${delay} ms.`);
    setTimeout(start, delay);
  });
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    stopping = true;
    child?.kill(signal);
    setTimeout(() => process.exit(0), 3000).unref();
  });
start();
