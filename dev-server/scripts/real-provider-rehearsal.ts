/**
 * Real-provider rehearsal: one fictional meeting through the running dev server with OpenAI keys set.
 *
 *   OPENAI_API_KEY=… OPENAI_TEXT_MODEL=gpt-5.4-mini npm start        # terminal 1
 *   OPENAI_API_KEY=… npx tsx scripts/real-provider-rehearsal.ts       # terminal 2
 *
 * It speaks a short three-person meeting with OpenAI TTS (different voices), uploads it as the
 * recording, finishes the meeting so the server runs diarized transcription and grounded extraction,
 * asks for a Facilitator opening line and a spoken question line, and prints timings. Paid calls:
 * keep it for manual rehearsals, never for CI.
 */
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.env.REHEARSAL_API ?? "http://127.0.0.1:4417";
const key = process.env.OPENAI_API_KEY;
if (!key)
  throw new Error("Set OPENAI_API_KEY to synthesize the rehearsal audio.");
const api = `${base}/api/mobile/meetings/v1`;
const IDS = {
  dana: "20000000-0000-4000-8000-000000000001",
  priya: "20000000-0000-4000-8000-000000000003",
  marcus: "20000000-0000-4000-8000-000000000004",
};
const script: [voice: string, text: string][] = [
  [
    "coral",
    "Okay, we need to pick a ship date for the Larkspur carrier rollout today.",
  ],
  [
    "ash",
    "The carrier portal is ready, but production credentials arrive Thursday at the earliest.",
  ],
  ["sage", "Then I can't promise Monday. I'd rather ship Wednesday next week."],
  [
    "coral",
    "Fine. Decision: we ship Wednesday. Priya, can you confirm the credentials by Thursday?",
  ],
  [
    "ash",
    "Yes, I'll confirm the production credentials by Thursday afternoon.",
  ],
  [
    "sage",
    "Open question for later: who handles weekend pickups if the carrier slips?",
  ],
];
const timings: [string, number][] = [];
async function timed<T>(label: string, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    timings.push([label, Math.round(performance.now() - started)]);
  }
}
let token = "";
async function call(path: string, body?: unknown) {
  const r = await fetch(path.startsWith("http") ? path : api + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": randomUUID(),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = r.status === 204 ? null : await r.json();
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${JSON.stringify(json)}`);
  return json;
}
async function speak(voice: string, text: string): Promise<Buffer> {
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini-tts",
      voice,
      input: text,
      response_format: "aac",
    }),
  });
  if (!r.ok) throw new Error(`TTS failed: ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const health = await call(`${base}/health`);
console.log("Providers:", JSON.stringify(health.providers));
// ADTS AAC frames concatenate into one stream; ffmpeg then wraps it in the .m4a container phones record.
const adts = Buffer.concat(
  await timed("Synthesize 6 meeting lines (rehearsal setup)", () =>
    Promise.all(script.map(([voice, text]) => speak(voice, text))),
  ),
);
const work = mkdtempSync(join(tmpdir(), "rehearsal-"));
writeFileSync(join(work, "meeting.aac"), adts);
execFileSync("ffmpeg", [
  "-y",
  "-loglevel",
  "error",
  "-i",
  join(work, "meeting.aac"),
  "-c",
  "copy",
  join(work, "meeting.m4a"),
]);
const audio = readFileSync(join(work, "meeting.m4a"));
const { pairingCode } = await call(`${base}/dev/pairing-code`, {});
token = (await call("/advisor/pair", { pairingCode })).accessToken;
const meeting = await call("/meetings", {
  title: "Carrier rollout date",
  startsAt: null,
  minutes: 20,
  purpose: "Decide the carrier rollout date",
  outcomes: ["Agree a ship date", "Name who confirms credentials"],
  execution: "Review readiness, decide, assign\nResult owner: Dana",
  attendees: [
    { personId: IDS.dana, roles: ["decision_maker"] },
    { personId: IDS.priya, roles: ["resource"] },
    { personId: IDS.marcus, roles: ["executor"] },
  ],
});
await timed("Plan and Meeting Gate", () =>
  call(`/meetings/${meeting.id}/plan`, {}),
);
const session = await call(`/meetings/${meeting.id}/sessions`, {
  mode: "facilitator",
});
await call(`/sessions/${session.id}/consent`, {
  attendees: Object.values(IDS).map((personId) => ({
    personId,
    state: "consented",
    at: new Date().toISOString(),
  })),
  noticeVersion: "rehearsal-1",
  appVersion: "rehearsal",
});
const opening = await timed("Facilitator opening line (text model)", () =>
  call(`/sessions/${session.id}/facilitator/turn`, { trigger: "opening" }),
);
console.log(
  "\nFacilitator:",
  JSON.stringify(opening.line ?? opening, null, 0).slice(0, 400),
);
const voice = await timed("Spoken line (TTS, cold cache)", () =>
  call(`${base}/api/mobile/v1x/voice/lines`, {
    sessionId: session.id,
    lines: [
      { id: "q1", text: "What date can we commit to for the carrier rollout?" },
    ],
  }),
);
console.log("Voice line:", voice.lines[0].durationMs, "ms of audio");
await timed("Upload recording", () =>
  call(`/sessions/${session.id}/segments`, {
    segmentIndex: 0,
    chunkIndex: 0,
    chunkCount: 1,
    sha256: sha(audio),
    segmentSha256: sha(audio),
    durationMs: 30000,
    data: audio.toString("base64"),
  }),
);
const finished = await timed(
  "Finish: diarized transcription + extraction",
  () => call(`/sessions/${session.id}/finish`, {}),
);
const after = await call(`/sessions/${session.id}`);
console.log("\nTranscript:");
for (const t of after.transcript ?? [])
  console.log(`  [${t.speakerCluster ?? "?"}] ${t.text}`);
console.log("\nProposals:");
for (const p of finished.proposals ?? [])
  console.log(
    `  ${p.kind}: ${JSON.stringify(p.body)}\n    quote: "${p.sources?.[0]?.quote ?? ""}"`,
  );
console.log("\nTimings (ms):");
for (const [label, ms] of timings)
  console.log(`  ${String(ms).padStart(6)}  ${label}`);
console.log(
  "\nSpent this session (server estimate, cents):",
  after.spentCents ?? "n/a",
);
