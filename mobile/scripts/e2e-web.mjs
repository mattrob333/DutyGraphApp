#!/usr/bin/env node
/** Web acceptance flows. Export with matching EXPO_PUBLIC_* settings first; see --help. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(here, '..');
const args = process.argv.slice(2);
const read = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
if (args.includes('--help')) {
  console.log(`Usage: node scripts/e2e-web.mjs [--mode mock|http] [--flow participant|spoken|advisor|offline|task|pulse|facilitator|hybrid|decline|stale|wrapup|kickoff|setup|all] [--base-url URL] [--api-url URL]\nExport the web bundle first with matching EXPO_PUBLIC_DATA_SOURCE and API URLs. HTTP mode requires a running fake dev server. Do not set provider keys.`);
  process.exit(0);
}
const mode = read('--mode', process.env.E2E_MODE || 'http');
const flow = read('--flow', 'all');
const api = read('--api-url', process.env.E2E_API_URL || 'http://127.0.0.1:4417').replace(/\/$/, '');
if (!['mock', 'http'].includes(mode) || !['participant', 'spoken', 'advisor', 'offline', 'task', 'pulse', 'facilitator', 'hybrid', 'decline', 'stale', 'wrapup', 'kickoff', 'setup', 'all'].includes(flow)) throw new Error('Invalid --mode or --flow; use --help.');
// Tests may use only the local fake service; verify the provider modes before opening a browser.
if (mode === 'http') {
  const url = new URL(api);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('HTTP E2E requires a localhost fake server.');
  const response = await fetch(`${api}/health`);
  const health = await response.json();
  if (!response.ok || health.mode !== 'fake' || !health.providers || Object.values(health.providers).some(kind => kind !== 'fake')) throw new Error('HTTP E2E requires fake server and fake providers.');
}
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
let server;
let base = read('--base-url', process.env.E2E_BASE_URL);
if (!base) {
  const root = path.join(app, 'dist');
  if (!fs.existsSync(path.join(root, 'index.html'))) throw new Error('Export missing: run npm run export:web with matching EXPO_PUBLIC_* settings.');
  const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const name = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    const safe = name.startsWith(root + path.sep) && fs.existsSync(name) && fs.statSync(name).isFile();
    const file = safe ? name : path.join(root, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
}
const executablePath = process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
const theme = read('--theme', 'light');
if (!['light', 'dark'].includes(theme)) throw new Error('Use --theme light or dark.');
const screens = read('--screens', process.env.E2E_SCREEN_DIR);
if (screens) fs.mkdirSync(screens, { recursive: true });
const screenshot = async (name, prefix = 'advisor') => { if (screens) await page.screenshot({ path: path.join(screens, `${prefix}-${name}-${theme}.png`) }); };
let context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: theme });
let page = await context.newPage();
page.setDefaultTimeout(15000);
const button = name => page.getByRole('button', { name, exact: true });
const click = async name => { await button(name).waitFor({ state: 'visible' }); await button(name).click(); };
const expectVisible = async text => page.getByText(text, { exact: false }).filter({ visible: true }).first().waitFor({ state: 'visible' });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  if (flow === 'participant' || flow === 'spoken' || flow === 'offline' || flow === 'all') {
    if (flow === 'spoken' && mode !== 'mock') throw new Error('Spoken E2E requires the mock scripted recognizer.');
    if (flow === 'offline' && mode !== 'http') throw new Error('Offline E2E requires the HTTP fake server.');
    const requests = [];
    const attempts = [];
    page.on('request', request => { if (request.method() === 'POST' && /\/requests\/[^/]+\/submit$/.test(new URL(request.url()).pathname)) attempts.push(request); });
    page.on('response', response => { if (response.url().includes('/api/mobile/v1/')) requests.push(response); });
    await page.goto(`${base}/mobile/enroll?t=${'d'.repeat(64)}`);
    await click('Connect this phone');
    await click("Yes, that's me");
    await click('Not now');
    await expectVisible('Due now');
    const request = mode === 'mock' ? 'Questions about your work' : 'Your work at Larkspur Supply';
    await expectVisible(request);
    const card = page.getByText(request, { exact: mode === 'mock' }).first().locator('..');
    await card.getByRole('button').first().click();
    await screenshot('intro', 'participant');
    if (flow === 'spoken') {
      await click('Start with voice');
      await click('Allow microphone and start');
      const fragments = ['customer portal', 'order system', 'credit check', 'delivery address', 'don’t know', 'portal orders'];
      for (let i = 0; i < 6; i++) {
        await expectVisible(`Question ${i + 1} of 6`);
        const fragment = i === 4 ? /don.t know/i : new RegExp(fragments[i], 'i');
        await page.getByText(fragment).filter({ visible: true }).first().waitFor({ state: 'visible' });
        if (i === 0) await screenshot('voice-deck', 'participant');
        await page.getByRole('button', { name: /^Next(?:\. That covers it)?$/ }).click();
      }
    } else {
    await click('Type instead');
    for (let i = 0; i < 6; i++) {
      await expectVisible(`Question ${i + 1} of 6`);
      await page.getByLabel('Your answer').fill(`I do my job ${i + 1}.`);
      if (i === 0) await screenshot('typed-deck', 'participant');
      await click('Next');
      // These deliberately sparse answers leave chips missing, so the first Next nudges.
      await page.getByText(/^…/).first().waitFor({ state: 'visible' });
      await click('Next');
      const nextProgress = i === 5 ? 'One last thing' : `Question ${i + 2} of 6`;
      await expectVisible(nextProgress);
    }
    }
    await expectVisible('One last thing');
    await click("No, that's all");
    await expectVisible("Here's what we heard");
    await screenshot('review', 'participant');
    const edit = page.getByLabel(/^Your answer to:/).first();
    await edit.waitFor({ state: 'visible' });
    await edit.fill('I reviewed this answer.');
    const send = page.getByRole('button', { name: /^Send to / });
    await send.waitFor({ state: 'visible' });
    if (flow === 'spoken') await expectVisible('Voice');
    if (flow === 'offline') await context.setOffline(true);
    await send.click();
    if (flow === 'offline') {
      await button('Try again').waitFor({ state: 'visible' });
      if (await page.getByText("You're done. Thank you", { exact: false }).isVisible()) throw new Error('Sent appeared before acknowledgment.');
      await context.setOffline(false);
      await click('Try again');
    }
    await expectVisible("You're done. Thank you");
    await screenshot('sent', 'participant');
    if (mode === 'http') {
      const submission = requests.find(r => /\/requests\/[^/]+\/submit$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST');
      if (flow === 'offline' && (attempts.length !== 2 || attempts[0].headers()['idempotency-key'] !== attempts[1].headers()['idempotency-key'])) throw new Error('Offline retry did not reuse its idempotency key exactly once.');
      if (!submission || !submission.ok()) throw new Error('HTTP submission acknowledgement was not observed; check bundle data source and API URL.');
      const body = submission.request().postDataJSON();
      if (!body || !JSON.stringify(body).includes('I do my job') || !JSON.stringify(body).includes('I reviewed this answer.') || body.questionAnswerSources?.['question.0']?.via !== 'typed') throw new Error('Submission did not contain the typed answer, review edit, and typed source.');
    } else if (requests.length) throw new Error('Mock run unexpectedly called the participant HTTP API; check bundle data source.');
    console.log(`PASS ${flow === 'offline' ? 'offline retry' : flow === 'spoken' ? 'scripted spoken interview' : 'participant typed interview'} (${mode})`);
  }
  if (flow === 'advisor' || flow === 'facilitator' || flow === 'hybrid' || flow === 'decline' || flow === 'stale' || flow === 'all') {
    if (flow === 'stale' && mode !== 'http') throw new Error('Source revision E2E requires the HTTP fake server.');
    // A fresh browser context keeps the two kinds of session independent.
    await context.close();
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: theme });
    page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const responses = [];
    page.on('response', response => { if (response.url().includes('/api/mobile/meetings/v1/')) responses.push(response); });
    let code = 'DEMO';
    if (mode === 'http') {
      const pairing = await fetch(`${api}/dev/pairing-code`, { method: 'POST' });
      if (!pairing.ok) throw new Error('Could not create a fake-server pairing code.');
      code = (await pairing.json()).pairingCode;
    }
    await page.goto(`${base}/invite`);
    await click('I run meetings for a company');
    await page.getByLabel('Pairing code').fill(code);
    await click('Pair this phone');
    await expectVisible('Meetings');
    await screenshot('center');
    await click('New meeting');
    await page.getByLabel('Meeting title').fill('Shipping decision');
    await page.getByLabel('Length in minutes').fill('30');
    await screenshot('builder');
    await click('Plan the outcome');
    const answers = ['Decide when to ship.', flow === 'hybrid' ? 'Status update\nDecide shipping date' : 'Agree a shipping date.', 'Priya contributes.', 'Set a date and notify the team.', 'Priya owns the next step.'];
    const questions = ['Why does this meeting exist?', 'What must be true when it ends?', 'Who must decide, contribute or carry out the work?', 'What happens next, and by when?', 'Who owns the result?'];
    for (let i = 0; i < answers.length; i++) {
      await page.getByRole('heading', { name: questions[i], exact: true }).waitFor({ state: 'visible' });
      await page.getByLabel('Your answer').fill(answers[i]);
      if (i === 4) await screenshot('power');
      await click(i === 4 ? 'Choose attendees' : 'Next');
    }
    await expectVisible('Who needs to be here?');
    await page.getByRole('button', { name: /^Priya Shah,/ }).click();
    await click('Decision maker');
    if (flow === 'hybrid' || flow === 'decline') {
      await page.getByRole('button', { name: /^Marcus Lee,/ }).click();
      if (flow === 'hybrid') {
      await page.getByRole('button', { name: '✓ Resource person', exact: true }).last().click();
      await page.getByRole('button', { name: 'Needs to know', exact: true }).last().click();
      }
    }
    await screenshot('attendees');
    await click('Build the plan');
    await expectVisible('Meeting gate');
    await screenshot('plan');
    if (flow === 'hybrid') {
      await expectVisible('Pulse first, then a shorter meeting');
      await expectVisible('people can receive the result instead');
      await click('Send a Pulse instead');
      await expectVisible('Pulse before the meeting');
      await click('Create the Pulse');
      await expectVisible('of 2 complete');
      if (mode === 'http') {
        const pulse = responses.find(r => /\/meetings\/[^/]+\/pulse$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
        if (!pulse) throw new Error('Pulse creation was not acknowledged.');
        const body = await pulse.json();
        if (!body.perPerson || body.perPerson.length !== 2) throw new Error('Pulse recipients do not match the selected people.');
      }
      console.log(`PASS hybrid gate and Pulse creation (${mode})`);
    } else {
    await click('Keep as planned');
    await screenshot('start');
    if (flow === 'facilitator') await page.getByRole('radio', { name: 'Facilitator', exact: true }).click();
    await click('Check everyone’s consent');
    await expectVisible('Ask everyone first');
    await screenshot('consent');
    await page.getByRole('radio', { name: 'Consent', exact: true }).first().click();
    if (flow === 'decline') await page.getByRole('radio', { name: 'Declined', exact: true }).last().click();
    await click('Confirm consent and continue');
    await expectVisible('Live transcript and notes');
    await screenshot('live');
    if (flow === 'decline' && await page.getByRole('button', { name: /Marcus Lee/ }).count()) throw new Error('Declined attendee can be selected as a note speaker.');
    if (flow === 'facilitator') {
      await click('Read opening');
      await click('Mute AI');
      await click('Stop AI');
      await expectVisible('AI stopped. Recording and notes continue.');
    }
    await page.getByRole('button', { name: /Priya Shah/ }).first().click();
    await page.getByLabel('Words to keep for review').fill('Priya will confirm the shipping date.');
    await click('Save note');
    await expectVisible('Priya will confirm the shipping date.');
    await click('Review closing');
    await expectVisible('Close the loop');
    await screenshot('closing');
    await click('Finish and review sources');
    await expectVisible('Who said what?');
    await page.getByRole('button', { name: /Priya Shah/ }).first().click();
    await screenshot('speakers');
    await click('Confirm speaker map');
    await expectVisible('Meeting results');
    await expectVisible('Priya will confirm the shipping date.');
    await screenshot('results');
    await click('Accept');
    await page.getByText('Accepted', { exact: true }).filter({ visible: true }).waitFor({ state: 'visible' });
    if (flow === 'stale') {
      const sourcePost = responses.find(r => /\/sessions\/[^/]+\/transcript$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
      if (!sourcePost) throw new Error('Original source segment was not acknowledged.');
      const original = sourcePost.request().postDataJSON().segments[0];
      const authorization = sourcePost.request().headers().authorization;
      if (!authorization) throw new Error('Missing fake-server session for source revision.');
      const correction = await fetch(sourcePost.url(), { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ segments: [{ ...original, revision: original.revision + 1, text: 'Priya will confirm the revised shipping date.' }] }) });
      if (!correction.ok) throw new Error(`Fake-server source revision failed (${correction.status}).`);
      // Refresh through the app so the reviewer sees the stale proposal and must check the new source.
      await click('Check speaker map');
      await click('Confirm speaker map');
      await expectVisible('The transcript changed. Check this again.');
      if (await button('Accept').isEnabled()) throw new Error('Stale proposal was still acceptable.');
      await click('Edit');
      await expectVisible('Priya will confirm the revised shipping date.');
      if (await button('Save proposed wording').isEnabled()) throw new Error('Stale proposal could be saved before checking sources.');
      await click('Use the current sources');
      await click('Save proposed wording');
      await expectVisible('Priya will confirm the revised shipping date.');
      await click('Accept');
      await page.getByText('Accepted', { exact: true }).filter({ visible: true }).waitFor({ state: 'visible' });
      const decisions = responses.filter(r => /\/proposals\/[^/]+\/decision$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
      const revised = await decisions.at(-1).json();
      if (!revised.sources?.some(ref => ref.revision === 2 && ref.quote === 'Priya will confirm the revised shipping date.')) throw new Error('Reaccepted proposal did not retain corrected source.');
      console.log('PASS stale source review and reacceptance (http)');
    }
    if (mode === 'http') {
      const commands = responses.filter(r => r.request().method() === 'POST' && r.ok());
      if (commands.length < 5) throw new Error('Advisor server commands were not acknowledged; check bundle data source and API URL.');
      const decision = commands.find(r => /\/proposals\/[^/]+\/decision$/.test(new URL(r.url()).pathname));
      if (!decision || decision.request().postDataJSON().decision !== 'accept') throw new Error('Proposal acceptance was not acknowledged.');
      const accepted = await decision.json();
      if (accepted.state !== 'accepted' || !accepted.sources?.some(s => s.personKey)) throw new Error('Accepted proposal lacks confirmed speaker provenance.');
      if (flow === 'decline') {
        const consent = commands.find(r => /\/sessions\/[^/]+\/consent$/.test(new URL(r.url()).pathname));
        const attendees = consent?.request().postDataJSON().attendees ?? [];
        const allowed = attendees.find(a => a.state === 'consented');
        const declined = attendees.find(a => a.state === 'declined');
        if (attendees.length !== 2 || !allowed || !declined) throw new Error('Expected one consenting and one declining attendee.');
        const note = commands.find(r => /\/sessions\/[^/]+\/transcript$/.test(new URL(r.url()).pathname));
        const segment = note?.request().postDataJSON().segments?.[0];
        if (segment?.personKey !== allowed.personKey || segment?.personKey === declined.personKey) throw new Error('The note was attributed to the wrong attendee.');
        const finish = commands.find(r => /\/sessions\/[^/]+\/finish$/.test(new URL(r.url()).pathname));
        const result = finish && await finish.json();
        if (!result?.proposals?.length || result.proposals.some(p => p.sources.some(source => source.personKey === declined.personKey))) throw new Error('A proposal contains a declined attendee source.');
        console.log('PASS declined attendee exclusion through sourced acceptance (http)');
      }
      if (flow === 'facilitator') {
        const turns = commands.filter(r => /\/facilitator\/turn$/.test(new URL(r.url()).pathname));
        if (!turns.some(r => r.request().postDataJSON().trigger === 'opening')) throw new Error('Facilitator opening trigger was not acknowledged.');
      }
    } else if (responses.length) throw new Error('Mock advisor run unexpectedly called the HTTP API.');
    console.log(`PASS ${flow === 'facilitator' ? 'facilitator' : 'advisor meeting'} through proposal acceptance (${mode})`);
    }
  }
  if (['task', 'pulse', 'wrapup', 'kickoff', 'setup'].includes(flow)) {
    await context.close();
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', colorScheme: theme });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    const extraResponses = [];
    page.on('response', response => { if (response.url().includes('/api/mobile/')) extraResponses.push(response); });
    if (flow === 'kickoff' || flow === 'setup') {
      await page.goto(`${base}/invite`); await click('I run meetings for a company');
      const code = mode === 'http' ? (await (await fetch(`${api}/dev/pairing-code`, { method: 'POST' })).json()).pairingCode : 'DEMO';
      await page.getByLabel('Pairing code').fill(code); await click('Pair this phone');
      if (flow === 'setup') {
        await page.getByRole('button', { name: /^Setup by voice,/ }).click();
        const setupQuestions = ['What does the company provide, and to whom?', 'What stages take one request through to delivery?', 'Which departments do that work?', 'What ongoing duties belong to each role?', 'Who is on the team, and who do they report to?', 'Which goals matter now, and how do you measure them?', 'Which systems hold the information your team uses?', 'Describe one recent task. What is one unit, how many a week, and about how long do you think one takes?'];
        for (let i = 0; i < setupQuestions.length; i++) {
          await page.getByRole('heading', { name: setupQuestions[i], exact: true }).waitFor({ state: 'visible' });
          await page.getByLabel('Your answer').fill(`Fictional setup answer ${i + 1}.`);
          if (i === 0) await screenshot('setup');
          await click(i === setupQuestions.length - 1 ? 'Review setup proposals' : 'Next');
        }
        await expectVisible('Here is what we heard');
        await screenshot('setup-review');
        for (let i = 0; i < setupQuestions.length; i++) await page.getByRole('button', { name: 'Confirm wording', exact: true }).first().click();
        await click('Confirm these proposals');
        await expectVisible('Confirmed proposals saved for review.');
        if (mode === 'http') {
          const confirmed = extraResponses.find(r => /\/setup\/[^/]+\/confirm$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
          if (!confirmed) throw new Error('Setup confirmation was not acknowledged.');
          const body = confirmed.request().postDataJSON();
          if (body.proposals?.length !== setupQuestions.length || body.proposals.some(p => !p.quote || !p.source)) throw new Error('Setup confirmation lacks proposal provenance.');
        }
        console.log(`PASS setup proposals reviewed and confirmed (${mode})`);
      } else {
      await page.getByRole('button', { name: /^Executive kickoff,/ }).click();
      await page.getByRole('button', { name: /^Priya Shah,/ }).click();
      await click('Start kickoff guide');
      for (let i = 1; i <= 3; i++) {
        await expectVisible(`Topic ${i} of 8`);
        await page.getByRole('button', { name: 'Priya Shah', exact: true }).click();
        await page.getByLabel('Attributed note').fill(`Fictional kickoff note ${i}.`);
        await click('Keep this note'); await expectVisible('Notes saved on this phone.');
        if (i < 3) await click('Next topic');
      }
      await expectVisible('Fictional kickoff note 3.');
      await click('Previous topic'); await expectVisible('Fictional kickoff note 2.');
      await click('Previous topic'); await expectVisible('Fictional kickoff note 1.');
      await expectVisible('Priya Shah');
      await click('Send notes for review');
      await expectVisible('Notes sent for review.');
      await screenshot('kickoff');
      if (mode === 'http') {
        const notes = extraResponses.find(r => /\/kickoff\/[^/]+\/notes$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
        if (!notes) throw new Error('Kickoff notes were not acknowledged by the fake server.');
        const body = notes.request().postDataJSON();
        if (body.notes?.length !== 3 || body.notes.some(n => !n.speakerPersonId || !n.text)) throw new Error('Kickoff notes lack three attributed sources.');
      }
      console.log(`PASS kickoff three attributed topics and send (${mode}; restart not tested because web storage is memory-only)`);
      }
    } else {
      await page.goto(`${base}/mobile/enroll?t=${'d'.repeat(64)}`);
      await click('Connect this phone'); await click("Yes, that's me"); await click('Not now');
      if (flow === 'wrapup') {
        if (mode !== 'http') throw new Error('Wrap-up E2E requires the fake HTTP fixture.');
        await expectVisible('Monday dispatch review');
        const wrapCard = page.getByText('Monday dispatch review', { exact: true }).first().locator('..');
        await wrapCard.getByRole('button', { name: 'Review', exact: true }).click();
        await expectVisible('I will check the dispatch queue before the next handoff.');
        if (await page.getByText(/private IT credential checklist/i).count()) throw new Error('Another participant’s item was exposed.');
        const detail = extraResponses.find(r => /\/confirmations\/50000000-0000-4000-8000-000000000002$/.test(new URL(r.url()).pathname) && r.ok());
        if (!detail) throw new Error('Participant confirmation was not fetched.');
        const view = await detail.json();
        if (view.items?.length !== 1 || JSON.stringify(view).includes('private IT credential checklist')) throw new Error('Participant API exposed another person’s item.');
        await page.getByRole('radio', { name: 'Confirm', exact: true }).click();
        await click('Send review'); await expectVisible('Sent. Thank you.');
        const confirmation = extraResponses.find(r => /\/confirmations\/[^/]+\/items\/[^/]+$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
        if (!confirmation) throw new Error('Owner confirmation was not acknowledged.');
        const body = confirmation.request().postDataJSON();
        if (body.decision !== 'confirm' || !body.expectedVersion || !body.contentHash) throw new Error('Owner confirmation lacks version/hash.');
        const pairing = await (await fetch(`${api}/dev/pairing-code`, { method: 'POST' })).json();
        const paired = await fetch(`${api}/api/mobile/meetings/v1/advisor/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ pairingCode: pairing.pairingCode }) });
        if (!paired.ok) throw new Error('Could not pair leader to check action status.');
        const auth = await paired.json();
        const result = await fetch(`${api}/api/mobile/meetings/v1/sessions/70000000-0000-4000-8000-000000000002/proposals`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
        const proposals = await result.json();
        const own = proposals.proposals?.find(p => p.id === '80000000-0000-4000-8000-000000000001');
        const other = proposals.proposals?.find(p => p.id === '80000000-0000-4000-8000-000000000002');
        if (!result.ok || own?.body?.status !== 'assigned' || other?.body?.status !== 'proposed') throw new Error('Owner confirmation did not assign only the participant’s action.');
        console.log('PASS participant-only wrap-up and owner assignment (http)');
      } else if (flow === 'task') {
        const count = 3;
        if (mode === 'http') await page.getByText('Check 3 task cards', { exact: true }).locator('..').getByRole('button', { name: 'Review', exact: true }).click();
        else await page.goto(`${base}/confirmations/req-confirm-friday`);
        await expectVisible(`Task Card 1 of ${count}`); await screenshot('task-card', 'participant');
        await page.getByRole('radio', { name: 'This is right', exact: true }).click();
        await click('Next Task Card'); await expectVisible(`Task Card 2 of ${count}`);
        await page.getByRole('radio', { name: 'Needs a change', exact: true }).click();
        await page.getByLabel('Add a note (optional)').fill('The timing needs an update.');
        if (count === 3) {
          await click('Next Task Card'); await expectVisible('Task Card 3 of 3');
          await page.getByRole('radio', { name: 'Not my work', exact: true }).click();
        }
        await click('Review choices'); await expectVisible('Your Task Card review');
        await expectVisible('The timing needs an update.'); await click('Send review');
        await expectVisible('Sent. Thank you.');
        if (mode === 'http') {
          const decisions = extraResponses.filter(r => /\/task-cards\/[^/]+\/(attest|decision)$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
          if (decisions.length !== 3) throw new Error('Expected three acknowledged Task Card choices.');
          const bodies = decisions.map(r => r.request().postDataJSON());
          if (bodies.some(b => !b.recordVersion || !b.contentHash) || !bodies.some(b => b.decision === 'correct') || !bodies.some(b => b.decision === 'needs_change') || !bodies.some(b => b.decision === 'not_mine')) throw new Error('Task decisions lack choices or version/hash.');
        }
        console.log(`PASS ${count} Task Card decisions (${mode})`);
      } else {
        if (mode === 'http') await click('Start Pulse');
        else await page.goto(`${base}/pulse/pulse-monday-ops`);
        await click('Type instead');
        for (let i = 0; i < 3; i++) {
          await expectVisible(`Question ${i + 1} of 3`);
          await page.getByLabel('Your answer').fill(`My update ${i + 1}.`);
          await click('Next');
          const nudge = page.getByText(/^…/).filter({ visible: true });
          if (await nudge.count()) await click('Next');
        }
        await expectVisible('One last thing'); await click("No, that's all");
        await expectVisible("Here's what we heard");
        await page.getByRole('button', { name: /^Send to / }).click();
        await expectVisible('Your Pulse is in. Thank you.'); await screenshot('pulse-complete', 'participant');
        await click('See team status'); await expectVisible('complete');
        if (await page.getByText(/My update [123]/).count()) throw new Error('Team status exposed an answer.');
        await screenshot('pulse-status', 'participant');
        if (mode === 'http') {
          const submission = extraResponses.find(r => /\/pulses\/[^/]+\/responses$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST' && r.ok());
          if (!submission || !JSON.stringify(submission.request().postDataJSON()).includes('My update')) throw new Error('Pulse response was not acknowledged.');
          const pairing = await (await fetch(`${api}/dev/pairing-code`, { method: 'POST' })).json();
          const paired = await fetch(`${api}/api/mobile/meetings/v1/advisor/pair`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ pairingCode: pairing.pairingCode }) });
          if (!paired.ok) throw new Error('Could not pair leader for second gate.');
          const auth = await paired.json();
          const status = await fetch(`${api}/api/mobile/meetings/v1/meetings/50000000-0000-4000-8000-000000000001/pulse`, { headers: { Authorization: `Bearer ${auth.accessToken}` } });
          const gate = await status.json();
          if (!status.ok || !gate.gate || gate.gate.mode !== 'NO_MEETING') throw new Error('Leader second gate did not show NO_MEETING after completion.');
        }
        console.log(`PASS Pulse review and team status (${mode})`);
      }
    }
  }
  if (errors.length) throw new Error(`Browser errors: ${errors.join('; ')}`);
} catch (error) {
  console.error('Current route:', new URL(page.url()).pathname);
  console.error('Visible text:', (await page.locator('body').innerText()).slice(0, 1800));
  throw error;
} finally {
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
}
