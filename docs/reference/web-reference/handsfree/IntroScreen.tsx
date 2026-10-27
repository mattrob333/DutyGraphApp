import { useEffect, useState } from "react";
import { minutesFor } from "../../../shared/hands-free/hints.ts";
import type { HandsFreeQuestion } from "../../../shared/hands-free/types.ts";
import { loadMic, orderMics, pickMic, saveMic, type Mic } from "../sponsor/live-voice-model.ts";
import type { TeamRequest } from "../TeamLink.tsx";
import { dueShort, introTitle, minutesLabel, physicalMicCount, privacyLines } from "./flow-model.ts";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

/** The intro (hf-03): who asks, how many questions, the short titles, and the two ways in. */
export function IntroScreen(p: {
  request: TeamRequest;
  questions: HandsFreeQuestion[];
  started: boolean;
  preview: boolean;
  /** Consent is remembered, so the consent screen (and its picker) is skipped: offer the choice here. */
  micChoice: boolean;
  onVoice: () => void;
  onType: () => void;
  onWhy: () => void;
}) {
  const titles = p.questions.filter((q) => !q.isElse);
  const from = p.request.advisorName?.trim() ? `Questions from ${p.request.advisorName.trim()}` : "Questions from your advisor";
  const due = dueShort(p.request.dueDate, new Date());
  return (
    <>
      <main className="hf-body">
        <div className="hf-col hf-in">
          <div className="hf-eyebrow">{[from, due].filter(Boolean).join(" · ")}</div>
          <h1 tabIndex={-1}>{introTitle(titles.length)}</h1>
          <p className="hf-lead">Read each card and just talk. When the chips turn green, tap Next. You'll review everything before it's sent.</p>
          <div className="hf-box">
            <div className="hf-list-title">{minutesLabel(minutesFor(titles.length))}</div>
            <ol className="hf-list">
              {titles.map((q, i) => (
                <li key={q.key}>
                  <span aria-hidden="true">{i + 1}</span>
                  <span>
                    <span className="hf-sr">{i + 1}. </span>
                    {q.short}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <p className="hf-small hf-intro-note">
            {p.preview
              ? "Preview only. Voice is off in the preview, and nothing is saved or sent."
              : p.started
                ? "Your answers so far are saved on this device. You can review everything before it's sent."
                : "You can review everything before it's sent. You do not need an account."}
          </p>
          {p.micChoice && !p.preview && <MicChoice />}
          <button type="button" className="hf-link" onClick={p.onWhy}>
            Why am I being asked this?
          </button>
        </div>
      </main>
      <footer className="hf-foot">
        <div className="hf-foot-in">
          <button type="button" className="hf-btn is-primary" onClick={p.onVoice}>
            {p.started ? "Continue with voice" : "Start with voice"}
          </button>
          <button type="button" className="hf-btn" onClick={p.onType}>
            Type instead
          </button>
        </div>
      </footer>
    </>
  );
}

/** The microphone for a returning person, when there is more than one; saved for the cards. */
function MicChoice() {
  const [mics, setMics] = useState<Mic[]>([]);
  const [mic, setMic] = useState(() => loadMic(storage()));
  useEffect(() => {
    let on = true;
    const md = typeof navigator === "undefined" ? undefined : navigator.mediaDevices;
    if (typeof md?.enumerateDevices !== "function") return;
    md.enumerateDevices()
      .then((devices) => {
        if (!on || physicalMicCount(devices) < 2) return;
        const list = orderMics(devices);
        setMics(list);
        setMic((m) => pickMic(list, m));
      })
      .catch(() => {});
    return () => {
      on = false;
    };
  }, []);
  if (mics.length < 2) return null;
  return (
    <label className="hf-mic">
      Microphone
      <select
        value={mic}
        onChange={(e) => {
          setMic(e.target.value);
          saveMic(storage(), e.target.value);
        }}
      >
        {mics.map((m) => (
          <option key={m.deviceId} value={m.deviceId}>
            {m.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * Before the microphone turns on (hf-04): what it does, then the browser's permission, asked only
 * when the person taps. With more than one physical microphone the person picks one (remembered
 * like LiveVoice's). A refusal opens the cards in typing with the "microphone is blocked" note.
 */
export function ConsentScreen(p: {
  advisorFirst: string;
  onConsent: () => void;
  onAllowed: () => void;
  onDenied: (reason: "permission" | "unavailable") => void;
  onType: () => void;
  /** The recorded backup's privacy line, when this device can record. */
  backupLine?: string;
}) {
  const [mics, setMics] = useState<Mic[]>([]);
  const [mic, setMic] = useState(() => loadMic(storage()));
  const [choosing, setChoosing] = useState(false);
  const [asking, setAsking] = useState(false);
  const listMics = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const list = orderMics(devices);
      setMics(list);
      setMic((m) => pickMic(list, m));
      return { list, physical: physicalMicCount(devices) };
    } catch {
      return { list: [] as Mic[], physical: 0 };
    }
  };
  // Devices have names (and ids) only once the page may use the microphone.
  useEffect(() => {
    if (typeof navigator.mediaDevices?.enumerateDevices === "function") void listMics();
  }, []);

  async function allow() {
    if (choosing) {
      saveMic(storage(), mic);
      return p.onAllowed();
    }
    p.onConsent();
    const md = navigator.mediaDevices;
    if (!md || typeof md.getUserMedia !== "function") return p.onDenied("unavailable");
    setAsking(true);
    try {
      let stream: MediaStream;
      try {
        stream = await md.getUserMedia({ audio: mic ? { deviceId: { exact: mic } } : true });
      } catch (e) {
        if (!mic || (e as Error).name !== "OverconstrainedError") throw e;
        stream = await md.getUserMedia({ audio: true });
      }
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) {
      setAsking(false);
      const name = (e as Error)?.name;
      if (name === "NotFoundError" || name === "NotSupportedError") return p.onDenied("unavailable");
      if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return p.onDenied("permission");
      // Busy or another problem: the cards try again and say so if it still fails.
      return p.onAllowed();
    }
    setAsking(false);
    const { list, physical } = await listMics();
    if (physical > 1 && !mics.length) {
      // Allowed just now, with a real choice: the names are new, so the person can pick before starting.
      setChoosing(true);
      return;
    }
    saveMic(storage(), pickMic(list, mic));
    p.onAllowed();
  }

  return (
    <>
      <main className="hf-body">
        <div className="hf-col hf-in">
          <h1 tabIndex={-1}>Answer out loud</h1>
          <p className="hf-lead">Before we turn on the microphone:</p>
          <ul className="hf-points">
            <li>The microphone is on only while the question cards are open. You can pause, skip or type at any time.</li>
            {privacyLines(p.advisorFirst).map((line) => (
              <li key={line}>{line}</li>
            ))}
            {p.backupLine && <li>{p.backupLine}</li>}
          </ul>
          {mics.length > 1 && (
            <label className="hf-mic">
              Microphone
              <select value={mic} onChange={(e) => setMic(e.target.value)}>
                {mics.map((m) => (
                  <option key={m.deviceId} value={m.deviceId}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {choosing && (
            <p className="hf-small" role="status" style={{ marginTop: 10 }}>
              The microphone is allowed. Choose the one you want to use, then start.
            </p>
          )}
        </div>
      </main>
      <footer className="hf-foot">
        <div className="hf-foot-in">
          <button type="button" className="hf-btn is-primary" disabled={asking} onClick={() => void allow()}>
            {choosing ? "Start" : asking ? "Waiting for the browser…" : "Allow microphone and start"}
          </button>
          <button type="button" className="hf-btn" onClick={p.onType}>
            Type instead
          </button>
        </div>
      </footer>
    </>
  );
}
