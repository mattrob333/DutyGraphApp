#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { servedContract } from './dutygraph-contract.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const flows = process.argv.slice(2);
const all = ['participant', 'offline', 'task', 'hybrid', 'pulse', 'advisor', 'facilitator', 'decline', 'stale', 'wrapup', 'kickoff', 'setup'];
if (!flows.length) flows.push(...all);
if (flows.some(flow => !all.includes(flow))) throw new Error('Unknown DutyGraph integration flow.');
const port = Number(process.env.E2E_API_PORT ?? 4317);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Use a local port from 1024 to 65535.');
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, DUTYGRAPH_API_URL: origin, E2E_API_PORT: String(port), EXPO_NO_TELEMETRY: '1', npm_config_cache: '/tmp/dutygraph-npm-cache' };
delete env.E2E_BASE_URL;
const directory = await mkdtemp(path.join(tmpdir(), 'dutygraph-v2-e2e-'));
const run = { runId: path.basename(directory), backend: 'DutyGraphV2 PostgreSQL', origin, startedAt: new Date().toISOString(), contracts: {}, flows: [] };
let service, active, stopping = false;
async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const done = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  try { await done; } finally { clearTimeout(timer); }
}
async function command(args, extraEnv = {}) {
  if (stopping) throw new Error('Integration run interrupted.');
  active = spawn(process.execPath, args, { cwd: mobile, env: { ...env, ...extraEnv }, stdio: 'inherit' });
  const [code] = await once(active, 'exit'); active = null;
  return code;
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
  stopping = true;
  void Promise.all([stop(active), stop(service)])
    .finally(async () => { await rm(directory, { recursive: true, force: true }); process.exit(1); });
});
try {
  const probe = createServer();
  await new Promise((resolve, reject) => { probe.once('error', reject); probe.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => probe.close(resolve));
  service = spawn(process.execPath, ['--import', 'tsx', 'scripts/serve-dutygraph-test.mjs'], { cwd: mobile, env, stdio: ['ignore', 'inherit', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (service.exitCode !== null) throw new Error('The actual DutyGraph test server exited before readiness.');
    try { for (const kind of ['advisor', 'participantExtras']) run.contracts[kind] = (await servedContract(origin, kind)).sha256; ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  if (!ready) throw new Error('The actual DutyGraph served contracts did not become ready.');
  if (await command(['scripts/generate-dutygraph-contracts.mjs'])) throw new Error('Served contract generation failed.');
  if (await command(['node_modules/expo/bin/cli', 'export', '--platform', 'web', '--clear'], { EXPO_PUBLIC_DATA_SOURCE: 'dutygraph-local', EXPO_PUBLIC_COMPANION_SCOPE: 'full', EXPO_PUBLIC_API_BASE_URL: origin })) throw new Error('The DutyGraph web bundle did not export.');
  for (const flow of flows) {
    console.log(`DutyGraphV2 flow: ${flow}`);
    const fixture = path.join(directory, `${flow}.json`);
    const seeded = await command(['--import', 'tsx', 'scripts/seed-dutygraph-fixture.mjs', fixture]);
    const code = seeded || await command(['scripts/e2e-web.mjs', '--mode', 'http', '--flow', flow, '--api-url', origin, '--base-url', origin, '--fixture', fixture]);
    run.flows.push({ flow, status: code === 0 ? 'passed' : 'failed' });
  }
  if (run.flows.some(flow => flow.status === 'failed')) process.exitCode = 1;
} catch (error) { run.error = error.message; process.exitCode = 1; console.error(error.message); }
finally {
  await Promise.all([stop(active), stop(service)]);
  await rm(directory, { recursive: true, force: true });
  run.finishedAt = new Date().toISOString();
  await mkdir(path.join(mobile, 'test-results'), { recursive: true });
  const result = path.join(mobile, 'test-results', `${run.runId}.json`);
  await writeFile(result, JSON.stringify(run, null, 2) + '\n');
  console.log(`Current-run integration report: ${result}`);
}
