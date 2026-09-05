import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';

const databasePort = Number(process.env.DB_PORT ?? 5433);
const apiUrl = `http://localhost:${process.env.PORT ?? 4000}`;
const frontendUrl = 'http://localhost:5173';
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const spawnOptions = { stdio: 'inherit' as const, env: process.env, shell: process.platform === 'win32' };
const children: ChildProcess[] = [];

function run(command: string, args: string[]): ChildProcess {
  const child = spawn(command, args, spawnOptions);
  children.push(child);
  return child;
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for port ${port}`);
}

function runOnce(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, spawnOptions);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code ?? 'unknown'}`));
    });
  });
}

function stop(child: ChildProcess): void {
  if (!child.pid || child.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function main(): Promise<void> {
  console.log('[dev] starting EgoPay development environment');

  if (await isPortOpen(databasePort)) {
    console.log(`[dev] database already available on 127.0.0.1:${databasePort}`);
  } else {
    run(npmCommand, ['run', 'db:start']);
    await waitForPort(databasePort, 30_000);
  }

  await runOnce(npmCommand, ['run', 'prisma:deploy']);
  console.log(`[dev] API will be available at ${apiUrl}`);

  const api = run(npmCommand, ['run', 'dev:api']);
  const frontend = run(npmCommand, ['run', 'dev:frontend']);
  await Promise.all([waitForPort(Number(process.env.PORT ?? 4000), 30_000), waitForPort(5173, 30_000)]);
  console.log(`[dev] preview available at ${frontendUrl}`);

  await new Promise<void>((resolve) => {
    api.once('exit', resolve);
    frontend.once('exit', resolve);
  });
}

const shutdown = () => {
  for (const child of children) stop(child);
};

process.once('SIGINT', () => {
  shutdown();
  process.exit(130);
});
process.once('SIGTERM', () => {
  shutdown();
  process.exit(143);
});

main().catch((error: unknown) => {
  console.error('[dev] failed:', error);
  shutdown();
  process.exit(1);
});