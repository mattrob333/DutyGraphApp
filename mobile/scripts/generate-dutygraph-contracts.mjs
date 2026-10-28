#!/usr/bin/env node
/** Generate only from served V2 contracts; participant v1 remains pinned. */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { localOrigin, servedContract } from './dutygraph-contract.mjs';

const mobile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = localOrigin(process.env.DUTYGRAPH_API_URL ?? 'http://127.0.0.1:4317');
const directory = await mkdtemp(path.join(tmpdir(), 'dutygraph-contracts-'));
try {
  const manifest = { source: 'DutyGraphV2 served OpenAPI', origin, generator: 'openapi-typescript@7.13.0', contracts: {} };
  const staged = [];
  for (const [kind, basename] of [['advisor', 'advisor-mobile-v1'], ['participantExtras', 'participant-extras-v1']]) {
    const result = await servedContract(origin, kind);
    const input = path.join(directory, `${basename}.json`);
    const output = path.join(directory, `${basename}.ts`);
    await writeFile(input, result.body);
    const child = spawn('npm', ['exec', '--yes', '--package=openapi-typescript@7.13.0', '--', 'openapi-typescript', input, '-o', output], {
      cwd: mobile, stdio: 'inherit', env: { ...process.env, npm_config_cache: '/tmp/dutygraph-npm-cache' },
    });
    const [code] = await once(child, 'exit');
    if (code !== 0) throw new Error(`Type generation failed for ${kind}.`);
    staged.push([path.join(mobile, '../contracts', `${basename}.openapi.json`), result.body]);
    staged.push([path.join(mobile, 'src/api/generated', `${basename}.ts`), await readFile(output)]);
    manifest.contracts[kind] = { path: new URL(result.url).pathname, sha256: result.sha256, version: result.contract.info?.version };
  }
  // Fetch and compile both contracts before replacing any checked-in artifact.
  for (const [target, contents] of staged) { await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, contents); }
  await writeFile(path.join(mobile, '../contracts/dutygraph-served-contracts.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log('Generated advisor and participant-extra wire types from the served DutyGraph contracts.');
} finally { await rm(directory, { recursive: true, force: true }); }
