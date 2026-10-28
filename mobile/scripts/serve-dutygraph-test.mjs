#!/usr/bin/env node
/** Actual V2 application + PostgreSQL, with providers injected only into this process. */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = path.resolve(process.env.DUTYGRAPH_BACKEND_ROOT ?? '/workspace/DutyGraphV2-mobile');
if (process.env.DUTYGRAPH_ENV_FILE) process.loadEnvFile(process.env.DUTYGRAPH_ENV_FILE);
else if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(root, '.env'));
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname)) throw new Error('The integration server requires localhost PostgreSQL.');
for (const name of Object.keys(process.env))
  if (/(?:OPENAI|ANTHROPIC|XAI|GROK|FIRECRAWL|EXA|TYPESAFE|RESEND).*KEY|DUTYGRAPH_ORIGIN|DEV_SERVER_/.test(name)) delete process.env[name];
process.env.NODE_ENV = 'test';
process.env.DOTENV_CONFIG_PATH = '/dev/null';
const port = Number(process.env.E2E_API_PORT ?? 4317);
process.env.APP_ORIGIN = `http://127.0.0.1:${port}`;
const moduleAt = name => import(pathToFileURL(path.join(root, name)).href);
const { createApp, errorHandler } = await moduleAt('server/app.ts');
const { pool } = await moduleAt('server/db.ts');
const { createFakeMobileMeetingProviderAdapter } = await moduleAt('server/mobile-meeting-providers.ts');
const app = createApp({
  mobile: { answerModel: { async run(input) {
    if (input.schemaName === 'covered_hints') return { model: 'injected-fake', raw: { covered: [] } };
    return { model: 'injected-fake', raw: { items: (input.payload.answers ?? []).map(answer => ({ key: answer.key, understood: answer.raw ?? answer.text ?? '', suggestion: null })) } };
  } } },
  mobileMeetingProviders: { adapter: createFakeMobileMeetingProviderAdapter(), simulation: true },
});
app.use(errorHandler);
// Same-origin browser harness: API requests enter the unchanged V2 app. This
// avoids granting cross-origin browser access to a native bearer-token API.
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  const pathname = new URL(req.url, process.env.APP_ORIGIN).pathname;
  if (pathname.startsWith('/api/')) return app(req, res);
  const candidate = path.resolve(webRoot, '.' + decodeURIComponent(pathname));
  const file = candidate.startsWith(webRoot + path.sep) && existsSync(candidate) && statSync(candidate).isFile() ? candidate : path.join(webRoot, 'index.html');
  if (!existsSync(file)) { res.writeHead(503); return res.end('Export the mobile web bundle first.'); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1');
await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
console.log('DutyGraphV2 PostgreSQL integration server listening with injected test providers.');
async function stop() { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await pool.end(); }
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void stop().finally(() => process.exit(0)); });
