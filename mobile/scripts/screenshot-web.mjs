#!/usr/bin/env node
/**
 * Design-review screenshots of the web export (mock data).
 *
 *   npm run export:web
 *   node scripts/screenshot-web.mjs --out ./shots /today /work "/pulse/pulse-monday-ops"
 *
 * Serves ./dist with an SPA fallback and captures each route at 390x844
 * (the prototype's frame). Uses Playwright from the project or a global
 * install. Pass --light for the light theme (prefers-color-scheme).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const args = process.argv.slice(2);
let out = 'shots';
let scheme = 'dark';
let all = false;
const routes = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') out = args[++i];
  else if (args[i] === '--light') scheme = 'light';
  else if (args[i] === '--all') all = true;
  else routes.push(args[i]);
}
if (all) {
  if (out === 'shots') out = '../docs/screens';
  routes.push('/invite', '/identity', '/permissions/microphone', '/today', '/me', '/me/voice', '/me/privacy', '/me/appearance', '/notifications',
    '/questions/req-hf-cobalt', '/questions/req-hf-cobalt/deck?mode=text', '/questions/req-hf-cobalt/deck?mode=voice',
    '/work', '/meetings', '/advisor/pair', '/dev/gallery', '/dev/tour');
}
if (!routes.length) routes.push('/today');

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  try {
    return req('playwright');
  } catch {
    const globalRoot = execSync('npm root -g').toString().trim();
    return createRequire(path.join(globalRoot, 'noop.js'))('playwright');
  }
}

const root = path.resolve('dist');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/ missing. Run `npm run export:web` first.');
  process.exit(1);
}
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(root, p);
  if (!(f === root || f.startsWith(root + path.sep)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(root, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const { chromium } = loadPlaywright();
const executablePath = process.env.CHROMIUM_PATH ?? (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const errors = [];
fs.mkdirSync(out, { recursive: true });
for (const theme of all ? ['dark', 'light'] : [scheme]) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: theme, reducedMotion: 'reduce' });
  page.on('pageerror', (e) => errors.push(e.message));
  for (const r of [...new Set(routes)]) {
    await page.goto(`http://localhost:${port}${r}`);
    await page.waitForFunction(() => document.body.innerText.trim().length > 8);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const name = (r.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root') + `-${theme}`;
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    console.log(`${r} -> ${path.join(out, name)}.png`);
  }
  await page.close();
}
await browser.close();
server.close();
if (errors.length) {
  console.log('\nBrowser errors:');
  for (const e of [...new Set(errors)]) console.log(' -', e.slice(0, 300));
  process.exitCode = 1;
}
