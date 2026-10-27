/** Manual only. Never imported by tests. No credentials or transcript text are printed. */
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import { WebSocket } from 'ws';
import { createProviders } from '../src/providers/index.ts';

async function rehearse(): Promise<void> {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_REQUIRED');
  const providers = createProviders({ apiKey: process.env.OPENAI_API_KEY, apiBaseUrl: process.env.OPENAI_API_BASE_URL, liveApiKey: process.env.OPENAI_LIVE_TRANSCRIBE_API_KEY, liveModel: process.env.OPENAI_LIVE_TRANSCRIBE_MODEL, liveWsUrl: process.env.OPENAI_LIVE_TRANSCRIBE_WS_URL, ttsModel: process.env.TTS_MODEL, ttsVoice: process.env.TTS_VOICE });
  const started = performance.now();
  const speech = await providers.tts.synthesize({ text: 'Who owns this work?' });
  const ttsMs = Math.round(performance.now() - started);
  const grant = await providers.liveTranscription.mint({ keywords: ['Cobalt'] });
  if (!grant.available) throw new Error(grant.reason);
  const wav = readFileSync(new URL('../src/providers/rehearsal-silence.wav', import.meta.url));
  let pcm: Buffer | undefined;
  for (let at = 12; at + 8 <= wav.length;) {
    const size = wav.readUInt32LE(at + 4);
    if (wav.toString('ascii', at, at + 4) === 'data') { pcm = wav.subarray(at + 8, at + 8 + size); break; }
    at += 8 + size + (size % 2);
  }
  if (!pcm || pcm.length !== 144000) throw new Error('INVALID_BUNDLED_WAV');
  const socket = new WebSocket(grant.wsUrl, ['realtime', `openai-insecure-api-key.${grant.clientSecret}`]);
  let firstWordMs: number | null = null;
  let streamStarted = performance.now();
  const opened = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('SOCKET_TIMEOUT')); }, 5000);
    socket.once('open', () => { clearTimeout(timer); resolve(); });
    socket.once('error', () => { clearTimeout(timer); reject(new Error('SOCKET_ERROR')); });
  });
  socket.on('message', raw => {
    try { const event = JSON.parse(raw.toString()); if (event.type === 'conversation.item.input_audio_transcription.delta' && event.delta && firstWordMs === null) firstWordMs = Math.round(performance.now() - streamStarted); } catch { /* Provider text is never logged. */ }
  });
  try {
    await opened;
    socket.send(JSON.stringify({ type: 'session.update', session: { type: 'transcription', audio: { input: { format: { type: 'audio/pcm', rate: 24000 }, transcription: { model: grant.model, ...grant.transcription }, turn_detection: null, noise_reduction: { type: 'near_field' } } } } }));
    streamStarted = performance.now();
    for (let at = 0; at < pcm.length; at += 4800) { socket.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: pcm.subarray(at, at + 4800).toString('base64') })); await delay(100); }
    socket.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
    await delay(2000);
    console.log(JSON.stringify({ rehearsal: true, ttsMs, audioBytes: speech.audio.length, streamMs: 3000, firstWordMs, totalMs: Math.round(performance.now() - started), fixture: 'silence: verifies transport only; speech recognition quality not measured' }));
  } finally { socket.terminate(); }
}
rehearse().catch(() => { console.error('Rehearsal failed. Inspect local configuration; provider details and credentials were withheld.'); process.exitCode = 1; });
