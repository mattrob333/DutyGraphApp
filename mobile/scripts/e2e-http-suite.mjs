#!/usr/bin/env node
/** One fresh, credential-free fake server per flow. Export an HTTP bundle first. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.resolve(mobile, '../dev-server');
const port = Number(process.env.E2E_API_PORT ?? 4417);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a local test port from 1024 to 65535.');
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1' };
for (const key of ['OPENAI_API_KEY', 'OPENAI_LIVE_TRANSCRIBE_API_KEY', 'DUTYGRAPH_ORIGIN', 'DEV_SERVER_DATA_FILE', 'E2E_BASE_URL']) delete env[key];
const flows = process.argv.slice(2);
if (!flows.length) flows.push('participant', 'offline', 'task', 'hybrid', 'pulse', 'advisor', 'facilitator', 'decline', 'stale', 'wrapup', 'kickoff', 'setup');
let active = null, activeBrowser = null;
const audioDir = await mkdtemp(path.join(tmpdir(), 'dutygraph-e2e-'));
env.DEV_SERVER_AUDIO_DIR = audioDir;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await done; } finally { clearTimeout(timer); }
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void Promise.all([stop(active), stop(activeBrowser)]).finally(() => process.exit(1)); });
try {
  // Refuse to attach to an old service or reset someone else's fixtures.
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
  for (const flow of flows) {
    console.log(`HTTP flow: ${flow}`);
    const server = spawn(process.execPath, ['--import', 'tsx', 'src/index.ts'], { cwd: backend, env, stdio: ['ignore', 'ignore', 'inherit'] });
    active = server;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error('The fake server exited before it was ready.');
      try {
        const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
        const health = await response.json();
        if (response.ok && health.mode === 'fake' && Object.values(health.providers ?? {}).length && Object.values(health.providers).every(mode => mode === 'fake')) { ready = true; break; }
      } catch { /* Wait only for this newly spawned local fixture server. */ }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error('The fake-provider server did not become ready.');
    const browser = spawn(process.execPath, ['scripts/e2e-web.mjs', '--mode', 'http', '--flow', flow, '--api-url', origin], { cwd: mobile, env, stdio: 'inherit' });
    activeBrowser = browser;
    const [code] = await once(browser, 'exit');
    activeBrowser = null;
    await stop(server); active = null;
    if (code !== 0) throw new Error(`HTTP flow failed: ${flow}`);
  }
} finally { await Promise.all([stop(active), stop(activeBrowser)]); await rm(audioDir, { recursive: true, force: true }); }
