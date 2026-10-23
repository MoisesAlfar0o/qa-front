import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const apiEntry = path.join(root, 'server.js');
const appPort = Number(process.env.PORT ?? 4173);
const apiPort = Number(process.env.API_PORT ?? 3001);

function parsePids(output) {
  const pids = new Set();
  const lines = output.split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/(\d+)/g);
    if (!match) continue;
    const pid = Number(match[match.length - 1]);
    if (Number.isFinite(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

async function killPort(port) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'netstat';
    args = ['-ano'];
  } else if (platform === 'darwin') {
    command = 'lsof';
    args = ['-ti', `tcp:${port}`];
  } else {
    command = 'ss';
    args = ['-ltnp', `sport = :${port}`];
  }

  try {
    const { stdout } = await exec(command, args);
    const pids = platform === 'win32'
      ? parsePids(stdout).filter((pid) => {
        const lines = stdout.split(/\r?\n/);
        return lines.some((line) => line.includes(`:${port}`) && line.includes('LISTENING') && line.includes(` ${pid}`));
      })
      : parsePids(stdout);

    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // no-op: process may have already exited
      }
    }
  } catch {
    // no-op: nothing listening on this port
  }
}

function exec(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(stderr || `Command failed: ${command} ${args.join(' ')}`));
      }
    });
  });
}

async function waitForHttp(url, timeoutMs = 30_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      if (response.ok) return;
    } catch {
      // keep retrying
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function main() {
  await killPort(appPort);
  await killPort(apiPort);

  const vite = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(appPort), '--strictPort'], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(appPort) },
  });

  const api = spawn(process.execPath, [apiEntry], {
    stdio: 'inherit',
    env: { ...process.env, PORT: String(apiPort) },
  });

  const cleanup = () => {
    vite.kill('SIGTERM');
    api.kill('SIGTERM');
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  try {
    await Promise.all([
      waitForHttp(`http://127.0.0.1:${appPort}`),
      waitForHttp(`http://127.0.0.1:${apiPort}/api/planner/status`),
    ]);
    console.log(`Dev stack ready on http://127.0.0.1:${appPort}`);
    await Promise.race([
      new Promise((resolve) => vite.once('exit', resolve)),
      new Promise((resolve) => api.once('exit', resolve)),
    ]);
  } finally {
    cleanup();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
