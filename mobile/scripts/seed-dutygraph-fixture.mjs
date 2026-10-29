#!/usr/bin/env node
/** Synthetic PostgreSQL fixture, using the V2 domain writers; never a public seed route. */
import { randomBytes, randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { localOrigin } from './dutygraph-contract.mjs';

const root = path.resolve(process.env.DUTYGRAPH_BACKEND_ROOT ?? '/workspace/DutyGraphV2-mobile');
const target = process.argv[2];
if (!target || !path.resolve(target).startsWith('/tmp/')) throw new Error('Write fixture credentials only to a private /tmp file.');
if (process.env.DUTYGRAPH_ENV_FILE) process.loadEnvFile(process.env.DUTYGRAPH_ENV_FILE);
else if (!process.env.DATABASE_URL) process.loadEnvFile(path.join(root, '.env'));
const database = new URL(process.env.DATABASE_URL ?? '');
if (!['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)) throw new Error('Synthetic fixtures require a localhost PostgreSQL database.');
const origin = localOrigin(process.env.DUTYGRAPH_API_URL ?? 'http://127.0.0.1:4317');
const moduleAt = (name) => import(pathToFileURL(path.join(root, name)).href);
const { registerAccount, createSession } = await moduleAt('server/auth.ts');
const { tx, putRecord, pool, hash } = await moduleAt('server/db.ts');
const { issueInvitation, askWithoutAi } = await moduleAt('server/invitations.ts');
const { buildQuestions } = await moduleAt('shared/hands-free/hints.ts');
const ids = Object.fromEntries(['participant', 'priya', 'marcus', 'request', 'confirmation', 'pulseMeeting', 'pulse', 'wrapup', 'wrapupSession', 'ownAction', 'otherAction'].map(key => [key, randomUUID()]));
try {
  const user = await registerAccount({ name: 'Alex Moreno', email: `${randomUUID()}@test.invalid`, password: randomBytes(32).toString('hex'), companyName: 'Larkspur Supply', scope: 'Fictional shipping team', goal: 'Test mobile work review' });
  const companyId = (await tx(user.tenant_id, db => db.query('SELECT id FROM companies WHERE tenant_id=$1', [user.tenant_id]))).rows[0].id;
  let cookie;
  const web = await createSession({ cookie(name, value) { cookie = `${name}=${value}`; } }, user);
  const invitationToken = await tx(user.tenant_id, async db => {
    // Explicit dispatch policy belongs only to this synthetic, injected-fake tenant.
    await db.query("UPDATE companies SET settings=settings || '{\"mobileProviderDailyDispatchLimit\":1000}'::jsonb WHERE tenant_id=$1 AND id=$2", [user.tenant_id, companyId]);
    for (const [key, name, role] of [['participant', 'Noah Reed', 'Shipping coordinator'], ['priya', 'Priya Shah', 'Warehouse lead'], ['marcus', 'Marcus Lee', 'Operations']])
      await putRecord(db, user, companyId, 'person', name, { name, email: `${key}-${randomUUID()}@example.test`, role, department: 'Shipping' }, 'accepted', undefined, 'Synthetic mobile acceptance fixture', ids[key]);
    const questions = ['What work do you do in a usual week?', 'What starts one shipment and what is one unit of work?', 'Which tools and systems do you use?', 'Who do you hand the work to?', 'Where does the work wait or get delayed?', 'How many shipments do you handle in a usual week, and about how long do you think one takes?'];
    const request = await putRecord(db, user, companyId, 'request', 'Your work at Larkspur Supply', { title: 'Your work at Larkspur Supply', personId: ids.participant, type: 'work', questions, questionPlanVersion: 'discovery-team:v1', dueDate: '2030-12-31', advisorName: 'Alex Moreno', notice: 'Fictional words are processed for review.' }, 'draft', undefined, 'Synthetic mobile acceptance fixture', ids.request);
    const invitation = await askWithoutAi.run(true, () => issueInvitation(db, user, companyId, request, request.version, 'manual_link'));
    const tasks = [];
    for (const title of ['Book carrier pickup', 'Check shipment details', 'Hand over a shipment'])
      tasks.push(await putRecord(db, user, companyId, 'task', title, { performerId: ids.participant, ownerId: ids.participant, duty: 'Shipping', purpose: 'Send an agreed shipment', trigger: 'A shipment is ready', inputs: 'Shipment details', instructions: 'Check the shipment and book pickup.', output: 'Booking reference', systems: ['Dispatch board'], destination: 'Warehouse team', reviewed: true }, 'awaiting_confirmation'));
    const check = await putRecord(db, user, companyId, 'request', 'Check your Task Cards', { title: 'Check your Task Cards', personId: ids.participant, type: 'confirmation', questions: ['Are these Task Cards right for your work?'], dueDate: '2030-12-31', taskIds: tasks.map(task => task.id), taskSnapshots: tasks.map(task => ({ id: task.id, version: task.version, hash: task.hash, title: task.title })), advisorName: 'Alex Moreno' }, 'draft', undefined, 'Synthetic mobile acceptance fixture', ids.confirmation);
    await issueInvitation(db, user, companyId, check, check.version, 'manual_link');
    const now = new Date().toISOString();
    const meeting = (id, title, attendees, state) => ({ id, companyId, title, startsAt: null, minutes: 30, power: { purpose: 'Share the shipment handoff status', outcomes: ['Shipment status known'], execution: 'Collect updates before deciding whether to meet' }, attendees, meetingType: 'INFORMATIONAL', secondaryPhases: [], agenda: [], gate: { mode: 'ASYNC', route: 'ASYNC', reason: 'Share these updates in a Pulse.', requiredPersonIds: [], releasedPersonIds: [ids.participant], liveMinutes: 0, asyncTopicIds: [], judgedBy: 'rules' }, routeChoice: 'pulse', state, version: 1, createdBy: user.id, createdAt: now, updatedAt: now });
    const wrap = meeting(ids.wrapup, 'Monday dispatch review', [{ personId: ids.participant, name: 'Noah Reed', roles: ['executor'] }, { personId: ids.priya, name: 'Priya Shah', roles: ['executor'] }], 'PARTIALLY_APPROVED');
    const pulseMeeting = meeting(ids.pulseMeeting, 'Shipment handoff update', [{ personId: ids.participant, name: 'Noah Reed', roles: ['resource'] }], 'PREPARING');
    for (const m of [pulseMeeting, wrap]) {
      await db.query('INSERT INTO mobile_meetings(id,tenant_id,company_id,title,state,version,content_hash,details,created_by) VALUES($1,$2,$3,$4,$5,1,$6,$7,$8)', [m.id, user.tenant_id, companyId, m.title, m.state, hash(m), JSON.stringify(m), user.id]);
      for (const a of m.attendees) await db.query('INSERT INTO mobile_meeting_attendees(id,tenant_id,company_id,meeting_id,person_key,person_record_id,display_name,roles,is_guest) VALUES($1,$2,$3,$4,$5::text,$5::uuid,$6,$7,false)', [randomUUID(), user.tenant_id, companyId, m.id, a.personId, a.name, JSON.stringify(a.roles)]);
    }
    await db.query('INSERT INTO mobile_pulses(id,tenant_id,company_id,meeting_id,title,due_at,estimate_minutes) VALUES($1,$2,$3,$4,$5,$6,3)', [ids.pulse, user.tenant_id, companyId, ids.pulseMeeting, 'Your shipment handoff update', '2030-12-31T17:00:00.000Z']);
    const pulseQuestions = buildQuestions(['What changed in your shipment work this week?', 'Is anything blocking the dispatch queue now?', 'Who needs to know about the next shipment handoff?'], { advisorName: 'Alex Moreno' });
    await db.query('INSERT INTO mobile_pulse_participants(id,tenant_id,company_id,pulse_id,person_record_id,questions,question_hash) VALUES($1,$2,$3,$4,$5,$6,$7)', [randomUUID(), user.tenant_id, companyId, ids.pulse, ids.participant, JSON.stringify(pulseQuestions), hash(pulseQuestions)]);
    await db.query("INSERT INTO mobile_meeting_sessions(id,tenant_id,company_id,meeting_id,mode,facilitator_state,started_at,ended_at,budget_cents,content_hash) VALUES($1,$2,$3,$4,'capture','COMPLETE',now(),now(),200,$5)", [ids.wrapupSession, user.tenant_id, companyId, ids.wrapup, hash({ id: ids.wrapupSession })]);
    for (const [index, a] of wrap.attendees.entries()) {
      await db.query("INSERT INTO mobile_meeting_consents(tenant_id,company_id,session_id,person_key,state) VALUES($1,$2,$3,$4,'consented')", [user.tenant_id, companyId, ids.wrapupSession, a.personId]);
      const segmentId = randomUUID(), proposalId = index ? ids.otherAction : ids.ownAction;
      const words = index ? 'I will review the private IT credential checklist.' : 'I will check the dispatch queue before the next handoff.';
      const source = { segmentId, revision: 1, quote: words, speakerCluster: `S${index + 1}`, personKey: a.personId };
      const body = { kind: 'action', what: words, ownerPersonKey: a.personId, due: null, dependsOn: [], doneWhen: 'Owner reports the check completed', status: 'proposed' };
      await db.query("INSERT INTO mobile_meeting_transcript_segments(id,tenant_id,company_id,session_id,revision,start_ms,end_ms,words,speaker_cluster,source,committed) VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,'live',true)", [segmentId, user.tenant_id, companyId, ids.wrapupSession, index * 10000, index * 10000 + 5000, words, source.speakerCluster]);
      await db.query('INSERT INTO mobile_meeting_speaker_maps(tenant_id,company_id,session_id,cluster,person_key,suggested,confirmed_by,id) VALUES($1,$2,$3,$4,$5,false,$6,$7)', [user.tenant_id, companyId, ids.wrapupSession, source.speakerCluster, a.personId, user.id, randomUUID()]);
      await db.query("INSERT INTO mobile_meeting_proposals(id,tenant_id,company_id,session_id,kind,state,version,content_hash,evidence,body,sources,decided_by,decided_at) VALUES($1,$2,$3,$4,'action','accepted',1,$5,'observed',$6,$7,$8,now())", [proposalId, user.tenant_id, companyId, ids.wrapupSession, hash({ body, source }), JSON.stringify(body), JSON.stringify([source]), user.id]);
    }
    return new URL(invitation.url).pathname.split('/').at(-1);
  });
  await writeFile(target, JSON.stringify({ schemaVersion: 1, backend: 'DutyGraphV2', origin, tenantId: user.tenant_id, companyId, invitationToken, web: { cookie, csrf: web.csrf }, ids }), { mode: 0o600, flag: 'wx' });
  console.log('Created an isolated fictional mobile fixture and a private manifest.');
} finally { await pool.end(); }
