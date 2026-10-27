import { useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import type { UnderstandResponse } from "../../../shared/participant-understand.ts";
import type { HandsFreeQuestion, UnderstoodAnswer } from "../../../shared/hands-free/types.ts";
import { reviewBlocks, sendFailure, submitBody, tookLabel, understandAnswers, type HandsFreeDraft, type ReviewBlock } from "./flow-model.ts";
import { CheckIcon, LiveRegion, OfflineNotice, SkipIcon, useOnline } from "./parts.tsx";
import { backupLine, type BackupQueue, type BackupView } from "./backup.ts";

/** Requests whose "Here's what we heard" call is running, so it is asked once even if the screen remounts. */
const asking = new Set<string>();

/**
 * "Here's what we heard" (hf-19, hf-20, hf-22): the existing /team/understand polishes the words
 * once; the person checks and changes them, then one Send. Sending shows a fill on the button and
 * the screen changes only after the server answered; a failed send keeps everything for Try again.
 */
export function ReviewScreen(p: {
  token?: string;
  preview: boolean;
  version: number;
  advisorName: string;
  advisorFirst: string;
  questions: HandsFreeQuestion[];
  draft: HandsFreeDraft;
  update: (patch: Partial<HandsFreeDraft>) => void;
  onRestart: () => void;
  onSent: (took: string) => void;
  /** Recordings still becoming text (backup.ts): Send waits for them. */
  backup?: BackupQueue;
  backupView?: BackupView;
}) {
  const { draft, questions } = p;
  const online = useOnline();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [nothing, setNothing] = useState(false);
  const [note, setNote] = useState("");
  const [heard, setHeard] = useState({ text: "", id: 0 });
  const alive = useRef(true);
  const update = useRef(p.update);
  update.current = p.update;
  useEffect(() => {
    alive.current = true;
    const t = setTimeout(() => setHeard({ text: "Here's what we heard. Check it, then tap Send.", id: 1 }), 150);
    return () => {
      alive.current = false;
      clearTimeout(t);
    };
  }, []);

  // Recordings still to become text (or that could not): the answers are not final until they are.
  const clips = p.backupView?.clips ?? [];
  const open = clips.filter((c) => c.state !== "failed");
  const failedClips = clips.filter((c) => c.state === "failed");
  const holding = open.length > 0 || failedClips.length > 0;

  // Ask once for the polished words; when that is unavailable the person's own words stand.
  const id = `${p.token || "preview"}:${draft.print}`;
  useEffect(() => {
    if (open.length > 0 || draft.understood !== undefined || asking.has(id)) return;
    const answers = understandAnswers(questions, draft.answers);
    if (!answers.length || p.preview || !p.token) return update.current({ understood: null });
    asking.add(id);
    api<UnderstandResponse>(`/invitations/${p.token}/team/understand`, "POST", { answers })
      .then((r) => update.current({ understood: r.available ? (r.items as UnderstoodAnswer[]) : null }))
      .catch(() => update.current({ understood: null }))
      .finally(() => asking.delete(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.understood === undefined, open.length > 0]);

  const sendLabel = p.advisorFirst ? `Send to ${p.advisorFirst}` : "Send";
  async function send() {
    if (sending || done || p.preview || !p.token || holding) return;
    const body = submitBody(p.version, questions, draft.answers, draft.understood, draft.edits);
    if (!body) return setNothing(true);
    setNothing(false);
    const key = draft.sendKey ?? crypto.randomUUID();
    if (!draft.sendKey) p.update({ sendKey: key });
    setFailed(null);
    setSending(true);
    try {
      await api(`/invitations/${p.token}/team`, "POST", body, key);
    } catch (e) {
      if (!alive.current) return;
      setSending(false);
      setFailed(sendFailure(e).message);
      return;
    }
    if (!alive.current) return;
    setDone(true);
    const took = tookLabel(Date.now() - new Date(draft.startedAt).getTime());
    setTimeout(() => p.onSent(took), 350);
  }

  const busy = sending || done;
  const blocks = draft.understood === undefined ? null : reviewBlocks(questions, draft.answers, draft.understood, draft.edits);
  return (
    <>
      <main className="hf-body">
        <div className="hf-col hf-in">
          <div className="hf-eyebrow">{p.advisorName === "your advisor" ? "Your answers" : `Questions from ${p.advisorName}`}</div>
          <h1 tabIndex={-1}>Here's what we heard</h1>
          <p className="hf-lead">Check it reads right. Change any word. Nothing is sent until you tap Send.</p>
          {!online && (
            <div style={{ marginBottom: 14 }}>
              <OfflineNotice />
            </div>
          )}
          {failed && (
            <div className="hf-alert" role="alert" style={{ marginBottom: 14 }}>
              <p className="hf-alert-title">Not sent yet</p>
              <p className="hf-alert-body">{failed}</p>
            </div>
          )}
          {open.length > 0 && (
            <p className="hf-note is-recording" role="status" data-hf-backup-queue>
              {backupLine({ clips, online: online })}
            </p>
          )}
          {failedClips.map((c) => (
            <div key={c.id} className="hf-alert" role="alert" style={{ marginBottom: 14 }}>
              <p className="hf-alert-title">We couldn't write down your recording for {questions[c.idx]?.isElse ? "the last card" : `question ${c.idx + 1}`}</p>
              <p className="hf-alert-body">{c.error}</p>
              <div className="hf-row">
                <button type="button" className="hf-btn is-primary" onClick={() => p.backup?.retry(c.id)}>
                  Try again
                </button>
                <button type="button" className="hf-btn" onClick={() => p.backup?.drop(c.id)}>
                  Keep my answer as it is
                </button>
              </div>
            </div>
          ))}
          {!blocks || open.length > 0 ? (
            <p className="hf-status-line" role="status">
              Putting your answers together…
            </p>
          ) : (
            blocks.map((b) => <Block key={b.key} block={b} onChange={(text) => p.update({ edits: { ...draft.edits, [b.key]: text } })} />)
          )}
          {blocks && !p.preview && (
            <p className="hf-small" style={{ marginTop: 6 }}>
              When you send, you confirm that this private link is for you and you agree to share these answers with {p.advisorFirst || "your advisor"}.
            </p>
          )}
          {nothing && (
            <div className="hf-note" role="status">
              <p>Answer at least one question before you send.</p>
              <button type="button" className="hf-link" onClick={p.onRestart}>
                Start the questions again
              </button>
            </div>
          )}
        </div>
      </main>
      <footer className="hf-foot">
        <div className="hf-foot-in">
          {note && (
            <p className="hf-small" role="status">
              {note}
            </p>
          )}
          <button
            type="button"
            className={"hf-btn is-primary" + (sending ? " is-sending" : "") + (done ? " is-done" : "")}
            aria-busy={busy}
            disabled={busy || p.preview || !blocks || holding}
            onClick={() => void send()}
          >
            <span className="hf-fill" aria-hidden="true" />
            <span style={{ position: "relative" }}>{busy ? "Sending…" : failed ? "Try again" : sendLabel}</span>
          </button>
          {p.preview ? (
            <p className="hf-small">Preview only. This preview does not save or send anything.</p>
          ) : (
            <button type="button" className="hf-link is-center" disabled={busy} onClick={() => setNote("Saved on this device. Open this link again on this device to finish.")}>
              Finish later
            </button>
          )}
        </div>
      </footer>
      <LiveRegion text={heard.text} id={heard.id} />
    </>
  );
}

/** One answer: editable, with the person's own words one click away; or a skip with its reason. */
function Block({ block: b, onChange }: { block: ReviewBlock; onChange: (text: string) => void }) {
  const [showRaw, setShowRaw] = useState(false);
  return (
    <section className="hf-box hf-review-block">
      <h2>{b.title}</h2>
      {b.kind === "skipped" ? (
        <p className="hf-skipline">
          <SkipIcon size={14} />
          {b.reason}
        </p>
      ) : (
        <>
          <textarea
            aria-label={`Your answer to: ${b.title.trim().replace(/[.?!]+$/, "")}. You can change it.`}
            maxLength={4000}
            rows={Math.max(2, Math.ceil(b.value.length / 48))}
            value={b.value}
            onChange={(e) => onChange(e.target.value)}
          />
          {b.polished && (
            <button type="button" className="hf-link" aria-expanded={showRaw} onClick={() => setShowRaw((v) => !v)}>
              {showRaw ? "Hide what I said" : "Show what I said"}
            </button>
          )}
          {showRaw && (
            <div className="hf-words">
              <span className="hf-label">Your words</span>
              {b.raw || "—"}
            </div>
          )}
          {b.note && (
            <div className="hf-later">
              <span className="hf-label">A note for later</span>
              {b.note}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "You're done." (hf-21), shown only after the server accepted the answers. */
export function SentScreen(p: { name: string; advisorName: string; took: string }) {
  const first = p.name.trim().split(/\s+/)[0];
  return (
    <main className="hf-body">
      <div className="hf-col">
        <section className="hf-sent" role="status">
          <div className="hf-sent-check" aria-hidden="true">
            <CheckIcon size={38} stroke={2.4} />
          </div>
          <h1 tabIndex={-1}>{first ? `You're done. Thank you, ${first}.` : "You're done. Thank you."}</h1>
          <p className="hf-lead">Your answers went to {p.advisorName}.</p>
          {p.took && <p className="hf-small">{p.took}</p>}
          <p className="hf-small" style={{ marginTop: 20 }}>
            {p.advisorName === "your advisor" ? "Your advisor" : p.advisorName} reviews your answers before using them. They do not change your duties or give
            anyone permission to act. You can close this page.
          </p>
        </section>
      </div>
    </main>
  );
}
