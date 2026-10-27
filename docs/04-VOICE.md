# 04 · Voice: live transcript in, voice-to-voice out

This file covers every sound the app hears and makes. Read `reference/docs/COMPANION-HANDS-FREE.md` (all of it, especially §2 timings and rules, §3 the deck reducer, §9 the web voice sources) before Phase 3.

## 1. What exists today

| Piece | Where | Status |
| --- | --- | --- |
| Deck reducer: phases `ready, listening, checking, more, got, saved, skipped, done`; effects `deckTimer`, `deckMic`, `deckServerCheck`; announcements | `seed/shared/hands-free/deck.ts` | Built, shared with the web and server, tested |
| Local coverage (cue matching), nudges, spoken skip detection | `seed/shared/hands-free/coverage.ts` | Built |
| Hint table (chips, nudges, cues per question) | `seed/shared/hands-free/hints.ts` | Built |
| Recorded backup merge | `seed/shared/hands-free/recorded.ts` | Built |
| Phone live speech: `native` (`expo-speech-recognition`), `simulated`, `unavailable` | `seed/mobile/src/features/voice/live/` | Built; native not run on a device |
| Phone recorded clip capture (`expo-audio`) and server transcription | `seed/mobile/src/features/voice/RecordedClipCapture.ts` | Built |
| Web live speech: OpenAI live transcription over WebSocket, browser speech, microphone handling | `reference/web-reference/handsfree/speech/` | Built on the web; checked once against the real OpenAI API (first word about 0.9 s) |
| Server mint for OpenAI live transcription | `reference/server-reference/live-transcription.ts` | Built for the web team link; not on the mobile API |
| Realtime voice interview (speech-to-speech, browser WebRTC, `gpt-realtime-2.1`, voice `marin`) | `reference/server-reference/voice-interviews.ts` | Built for a separate one-to-one interview link |
| "Read questions aloud" switch | `seed/mobile/src/app/me/voice.tsx` (`speakQuestions`) | Built as a switch; **not wired** to anything |
| `TextToSpeechProvider` interface | `seed/shared/companion-judgment.ts` | Types only |
| Text-to-speech anywhere | — | **Not built** |

## 2. Speech in (the live transcript)

### 2.1 Sources and order

1. **Device recognizer** (`native`, label `voice_device`): on-device where supported, interim results. Default on phones.
2. **OpenAI live transcription** (`openai`, label `voice_openai`): better accuracy and names. Used when the server grants a key and the person's company allows it. Port the web source:
   - Server mints a client secret: `POST {OPENAI_API_BASE_URL}/realtime/client_secrets` with `{ expires_after: { anchor: "created_at", seconds }, session: { type: "transcription", audio: { input: { format: { type: "audio/pcm", rate: 24000 }, transcription: { model, languages: ["en"], keywords, prompt, delay }, turn_detection: null, noise_reduction: { type: "near_field" } } } } }`. The response's `value` is the key. Defaults: model `gpt-live-transcribe`, delay `low`, WebSocket `wss://api.openai.com/v1/realtime?intent=transcription`, 600 s lifetime (env: `OPENAI_LIVE_TRANSCRIBE_*`).
   - The app opens the WebSocket with subprotocols `["realtime", "openai-insecure-api-key." + value]`, sends one `session.update` repeating the transcription config, then `input_audio_buffer.append` with base64 PCM16 mono 24 kHz about every 100 ms, and `input_audio_buffer.commit` when the deck detects a pause.
   - It reads `conversation.item.input_audio_transcription.delta` (append) and `.completed` (replace that item's words), matched by `item_id` because completions can arrive out of order.
   - Keywords: the request's hint labels and the company name, cleaned (no `<`, `>`, line breaks), at most 40, each at most 40 characters. Prompt (fixed): "An employee describes their own work for their company's advisor: the steps, the tools and systems, the people and teams, waits and decisions."
   - Limits per 24 hours: 12 per request, 400 per tenant. Any error or a 5 s timeout means `available: false`.
   - React Native needs raw PCM frames from the microphone. Find a maintained module that works with Expo SDK 57 (`npx expo install` will tell you); if none works, write a small local Expo module (`mobile/modules/pcm-mic`) with an AudioRecord/AVAudioEngine tap at 24 kHz mono, and keep the JS side behind the `LiveSpeech` interface so the deck does not care. Record the choice.
3. **Recorded clip** (always running as a backup while a spoken card listens): on failure of live words, transcribe after the card through `POST /requests/{id}/transcriptions` (the real server uses xAI `grok-voice-transcribe-2.0`; phone clips `audio/m4a`, `audio/x-m4a` or `audio/aac`; 25 MB limit). Its text replaces the live words heard during the failure (`applyRecorded`).
4. **Typing** (`typed`).

### 2.2 Session rules (port from the web, §9 of COMPANION-HANDS-FREE)

- **One microphone for the deck.** Start the source once and keep it running across cards. Add `reset()` to the app's `LiveSpeech` interface (the web has it): a new card calls `reset()` to forget earlier words, instead of stop and start, because phone recognizers often stay deaf when restarted right away. Words reach the deck only while `deckMic` is on.
- **Watchdog.** If the level meter hears sound for 6 s with no words, restart the source, at most 3 times a card; then fall back per 2.1.
- **Dropped signal.** A network error after words came is a drop: keep the microphone open, retry (2 s doubling to 15 s, and on `online`), keep voice mode.
- **Release.** Stop the source on pause, Type instead, leaving the deck, app background, and done. Resuming needs a tap.
- **Fallback once.** When the OpenAI socket will not open (the kept key and one fresh key) or drops, move to the device recognizer once, keeping the words already heard on that card, and from then on name the device's speech service in the Why sheet.

### 2.3 Answer source labels

Each `CardAnswer.input` records the source; `toSubmission` sends it as `questionAnswerSources` (`typed`, `voice_openai`, `voice_device`, `voice_browser`, with `edited` when the person typed on a spoken card or changed it on review). The advisor sees "Transcribed from voice on their device…" for a spoken answer.

## 3. Speech out on the cards (voice-to-voice, the default design)

### 3.1 What is spoken

| Line | When | Text source |
| --- | --- | --- |
| Question | A card shows (and on tap to replay) | `HandsFreeQuestion.text` |
| Nudge | A chip is missing after a pause, and the person is silent | The hint's `nudge` (table) or, with `followUps: ai`, the server's follow-up sentence |
| "Got it." / "Saved." | A card ends | Fixed |
| "One last thing." + else question | The else card | Fixed + `elseQuestionText(advisor)` |
| "Here's what we heard. Check it, then tap Send." | Review opens | Fixed |
| Pulse and Builder questions | Same as questions | From the server |

The deck's `announce` lines remain for screen readers. Do not speak them through the speaker when VoiceOver/TalkBack is on (the screen reader already reads them); speak questions only.

### 3.2 Generation and caching

- The server makes audio with text-to-speech (`TTS_MODEL`, default `gpt-4o-mini-tts`; `TTS_VOICE`, default `marin`; output MP3 or AAC). Cache key `sha256(model + voice + speed + text)`. The text is known before the deck starts, so the app calls `POST /api/mobile/v1x/voice/lines` once with every line for the request and downloads the files into the app cache (`expo-file-system`). Cost is about 2 cents per interview at published prices (estimate from October 21, 2026; recheck).
- Instructions to the TTS model (if it accepts them): "Calm, warm, clear. Normal speaking speed. A colleague asking a short question." No other style.
- Never log the text. The cache stores audio and the hash only.
- **Fallback:** device TTS (`expo-speech`, label nothing on screen). If both fail, the deck runs silently as today.

### 3.3 Reducer changes (Phase 3)

- `createDeck(questions, { …, speak })`. With `speak: false` nothing changes (all seed tests stay green).
- New phase `speaking` before `listening` on each new card when `speak` is on.
- New effect `deckVoice(state) → { lineId, text, kind } | null`: the line the caller must play now. When `lineId` changes, stop the old audio and play the new one.
- New events: `speechOutStart { lineId }`, `speechOutEnd { lineId }`, `speechOutError { lineId }`, `bargeIn`.
- `speechOutEnd` (or `speechOutError`) → `listening` at once. No fixed 1300 ms wait.
- `DECK_TIMING.speakFallback`: if no end event arrives, listen after the line's estimated duration (words × 400 ms) + 1500 ms.
- **Echo guard:** while `speaking`, `deckMic` is on (so the recognizer is warm) but the deck ignores `speech` events, unless the caller sends `bargeIn`.
- **Barge-in:** the hook sends `bargeIn` when the live source reports at least 2 new words, or the input level stays above the speech threshold for 300 ms, while `speaking`. The reducer stops the line (effect returns null) and goes to `listening`, keeping no words heard during the speaking window (they may be the app's own voice).
- **Nudges:** a nudge line is played only when the reducer enters `more` and no words arrived in the last 900 ms. If words arrive before it plays, skip it. It still counts toward `MAX_NUDGES`.
- **Pause** during `speaking` stops the audio; resume replays the question from the start.
- Previous, Add more and "You said" never replay the question. The skip sheet stops the audio.
- Announcements for `speaking`: "Question 2 of 6. <question>" (already in place).

### 3.4 Audio session

- Mode: play and record, voice chat / voice processing where available (hardware echo cancellation), route to the speaker (not the earpiece) unless headphones are connected, duck other audio, do not mix.
- iOS silent switch: play while the deck is open, because the person chose voice (setting in 11-DECISIONS).
- Bluetooth headsets: allow; prefer the headset microphone when connected.
- On a phone call or Siri interruption: pause the deck (as on background).

### 3.5 Speed and switch

Me › Voice: **Read questions aloud** (default on; the existing `speakQuestions` switch), **Voice speed** (0.9, 1.0, 1.1, sent as `speed` to the server; device TTS rate otherwise). The intro offers **Start with voice** (spoken + live words), **Type instead**.

### 3.6 Auto-advance (flag `autoAdvance`, default off)

When on: after every chip is heard and the person stops talking, the deck plays "Got it. Next question." then waits 3 s. Any word during those 3 s cancels it through the existing Keep talking path and returns to listening. It never fires while `speaking`, while any chip is missing, or on the else card. The late-server-check rule from October 18 stays: a server answer that arrives late never ends a card.

### 3.7 AI-written follow-ups (flag `followUps`, default `table`)

With `ai`, `POST /requests/{id}/coverage` (dev server, extended) may return `followUp: { text, hintId }`: one sentence, at most 20 words, about `hintId` only, written under the `voice-style.md` and `anti-overquestioning.md` layers with the question, the hint labels and the words passed as data blocks. The server rejects a follow-up that asks about a chip already covered, contains a name not in the words or the roster, or has more than one question mark. The deck speaks it in place of the table nudge for that hint; it counts as a nudge. With `table`, or when the field is absent, the table nudge is used.

## 4. Speech out in meetings

### 4.1 Provider interface

```ts
interface FacilitatorVoice {
  readonly kind: 'tts_lines' | 'realtime' | 'simulated';
  prepare(sessionId: string): Promise<void>;
  speak(line: { id: string; text: string }): Promise<void>; // resolves when finished or stopped
  stop(): void;           // barge-in or Mute
  setMuted(muted: boolean): void;
  dispose(): Promise<void>;
}
```

- **`tts_lines`** (default): the dev server returns the facilitator's line as text (`POST …/facilitator/turn`); the app turns it into audio with `POST /voice/lines` (streaming not needed for lines under 25 words) and plays it. Cheapest; the controller keeps full control.
- **`realtime`** (flag): OpenAI Realtime over WebRTC (`react-native-webrtc`, development build only). The dev server mints the session (`POST {OPENAI_API_BASE_URL}/realtime/calls` with the SDP, as `voice-interviews.ts` does, or a client secret), with `model: gpt-realtime-2.1`, `output_modalities: ["audio"]`, input transcription, `turn_detection: { type: "semantic_vad", eagerness: "low", create_response: false, interrupt_response: true }`, voice `TTS_VOICE`, instructions from `composeFacilitatorPrompt()`. The app sends `response.create` only on the six triggers (05 Section 9). Cost grows with session length because each response re-bills the conversation: restart the session every 15 minutes with a text summary, and keep instructions short. Record "not run on a device".
- **`simulated`**: scripted lines with fake durations, for mock data and tests.

A GPT-Live (`gpt-live-1`) adapter can be added later behind the same interface; do not build it unless every phase is done.

### 4.2 Turn-taking in a room

- The AI speaks only on: opening, time box end, 8 s silence after a question, leader taps Next, required item still empty at topic close, closing.
- Before speaking, wait for 1.2 s of silence. If people keep talking for 8 s, show the line on the leader's screen instead ("The assistant wanted to ask: …", with Say it now / Dismiss).
- Barge-in stops the AI at once; the line is shown on screen.
- Mute AI, Skip, Next topic and Stop AI are always visible. Stop AI never stops the recording.

### 4.3 Costs to show the leader (published prices, recheck before release)

From `reference/docs/voice-walkie-talkie.md` §6 (prices fetched September 29, 2026): record and process after a 60-minute meeting about $0.20 to $0.50; AI facilitating and speaking now and then about $1.50 (hybrid) to $4.50 to $5; AI voice live all hour about $4.50 to $12, up to about $48 with full realtime if caching fails. Show an estimate before a live mode starts, per the company's budget settings; at the cap, live voice stops and recording continues.

## 5. Recording a meeting

- `expo-audio`, AAC mono 32 kbps (60 minutes ≈ 14 MB), rolling 5-minute segments, SHA-256 per segment, chunked upload in 512 KB parts, resumable.
- iOS: background audio mode only while recording; the red indicator and timer always visible. Android 14+: foreground service of type microphone with a persistent notification ("DutyGraph is recording this meeting"). Configure both through config plugins in `app.json`; never edit native folders by hand.
- Warn before start when free space is under 500 MB, and for live modes when battery is under 30 %.
- A crash or phone call loses at most the current segment; resume starts a new segment in the same session.
- The live transcript during a meeting uses the same live source as the cards; committed segments go to the server with id and revision. The batch transcript after the meeting (with diarization) is the evidence of record.

## 6. Privacy copy (exact strings to start from)

- Consent (cards): "Your words are transcribed securely while you speak so the cards can follow along. Nothing goes to {advisor} until you review it and tap Send."
- Why sheet, service line: "{Service} turns your voice into text." where Service is "Your phone's speech service" or "OpenAI".
- Spoken questions: "DutyGraph reads each question aloud. You can turn this off in Me › Voice."
- Meeting consent statement: see 05 Section 7. Mark `// LEGAL REVIEW NEEDED`.
- Never: "Nothing leaves your phone", "We never store your voice", "Private" without saying from whom.

## 7. Tests (no real providers)

- Reducer: every rule in 3.3, 3.6, 3.7, plus property-style random event sequences: the mic is never "on for the deck" while `speaking` without barge-in; no card ends while words are arriving; `speak: false` matches the old behaviour.
- Voice out: fake player emits start/end/error; cache hit and miss; device fallback; silent fallback.
- Live in: PCM conversion (float32 → int16 → base64), message builders, delta/completed merge by `item_id` out of order, fallback order, watchdog, drop and retry.
- Meeting voice: triggers only, mute, stop never stops recording, barge-in shows the line on screen.
- `dev-server/scripts/rehearse-openai.ts` (manual only, needs `OPENAI_API_KEY`): one TTS line, one live-transcription session with a bundled WAV, prints first-word latency and total time.
