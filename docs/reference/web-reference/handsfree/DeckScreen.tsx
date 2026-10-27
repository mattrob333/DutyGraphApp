import { useEffect, useMemo, useRef } from "react";
import { cardStatus, deckReady, deckText, progressLabel, progressSegments, shownIndex, SKIP_LABELS, type DeckMode, type DeckPhase } from "../../../shared/hands-free/deck.ts";
import type { CardAnswer, HandsFreeQuestion, QuestionKey, SkipReason } from "../../../shared/hands-free/types.ts";
import { loadMic } from "../sponsor/live-voice-model.ts";
import { backupLine, clock, PART_WARN_MS, type BackupQueue } from "./backup.ts";
import { captionTail, keyAction, SHORTCUTS, webAnnouncement, youSaid } from "./flow-model.ts";
import { Bars, CheckIcon, LiveRegion, OfflineNotice, PauseIcon, Sheet, SkipIcon } from "./parts.tsx";
import type { SpeechSource, SpeechSourceKind } from "./speech/types.ts";
import { useWebHandsFreeDeck, type MicBlock } from "./useWebHandsFreeDeck.ts";

const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const SKIPS: { reason: SkipReason; label: string }[] = [
  { reason: "skip", label: "Skip" },
  { reason: "dontknow", label: "I don't know yet" },
  { reason: "someone", label: "Someone else should answer this" },
];

/**
 * The question cards (hf-05 … hf-18): one card at a time, no clicks needed while answering. The
 * card slides away when DutyGraph has what it asks for and the next one springs in; the caption
 * box shows the live words and the microphone level. Everything else is the shared deck reducer.
 */
export function DeckScreen(p: {
  questions: HandsFreeQuestion[];
  advisorName: string;
  mode: DeckMode;
  micBlocked: MicBlock;
  answers?: (CardAnswer | null)[];
  preview: boolean;
  speech?: (preferred?: SpeechSourceKind) => Promise<SpeechSource>;
  checkCoverage?: (questionKey: QuestionKey, text: string) => Promise<string[] | null>;
  onSpeechKind: (kind: SpeechSourceKind | null) => void;
  /** The Why sheet (owned by the page) is open: shortcuts wait, and closing it resumes a deck it paused. */
  whyOpen: boolean;
  onWhy: () => void;
  onAnswers: (answers: (CardAnswer | null)[], mode: DeckMode) => void;
  onDone: (answers: (CardAnswer | null)[]) => void;
  /** The recorded backup (backup.ts); absent in the preview or where this browser cannot record. */
  backup?: BackupQueue;
}) {
  const deviceId = useMemo(() => loadMic(storage()), []);
  const { state, send, micBlock, speechKind, level, backup } = useWebHandsFreeDeck({
    questions: p.questions,
    mode: p.preview ? "text" : p.mode,
    micBlocked: p.micBlocked,
    answers: p.answers,
    speech: p.speech,
    deviceId,
    checkCoverage: p.checkCoverage,
    onAnswers: p.onAnswers,
    onDone: p.onDone,
    backup: p.backup,
  });
  const recording = backup.enabled && backup.recording && backup.trouble;
  const waiting = backupLine(backup.view);
  const remaining = backup.view.remaining;
  const onKind = useRef(p.onSpeechKind);
  onKind.current = p.onSpeechKind;
  useEffect(() => {
    if (!p.preview) onKind.current(speechKind);
  }, [speechKind, p.preview]);

  const shown = shownIndex(state);
  const current = state.questions[state.idx];
  const voice = state.mode === "voice";
  const onCurrent = state.view == null;
  const listening = state.phase === "listening" || state.phase === "checking" || state.phase === "more";
  const live = voice && onCurrent && !state.paused && !state.speechError && listening;
  const canPrev = state.view != null ? state.view > 0 : state.idx > 0;
  const returnLabel = state.view != null ? (current?.isElse ? "Back to the last card" : `Back to question ${state.idx + 1}`) : null;

  // Keyboard (spec §9.3). Space pauses only outside text fields and buttons, where it types or presses.
  // Focus starts on the column in voice and in the typing box in typing.
  const top = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const whyOpen = useRef(p.whyOpen);
  whyOpen.current = p.whyOpen;
  const preview = p.preview;
  useEffect(() => {
    const box = stateRef.current.mode === "voice" ? null : top.current?.querySelector<HTMLTextAreaElement>("[data-hf-typing] textarea");
    (box ?? top.current)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      const s = stateRef.current;
      if (s.phase === "done" || e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      // Embedded in the advisor's page, the preview takes only the keys pressed inside it.
      if (preview && !(el instanceof Node && top.current?.closest(".hf")?.contains(el))) return;
      const tag = el?.tagName || "";
      const action = keyAction({
        key: e.key,
        modifier: e.ctrlKey || e.metaKey || e.altKey,
        shift: e.shiftKey,
        inText: tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el?.isContentEditable,
        onControl: tag === "BUTTON" || tag === "A" || tag === "SUMMARY",
        inTypingBox: !!el?.closest?.("[data-hf-typing]"),
        typing: s.mode === "text",
        sheetOpen: s.sheet || whyOpen.current,
      });
      if (!action) return;
      e.preventDefault();
      if (action === "togglePause") send({ type: s.paused ? "resume" : "pause" });
      else if (action === "prev") send({ type: "prev" });
      else if (action === "skip") send({ type: "openSkip" });
      else if (action === "typeInstead") send({ type: "toText" });
      else if (action === "next") send({ type: "next" });
      else if (action === "close") send({ type: "closeSkip" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [send, preview]);

  // Why pauses the deck; closing it resumes, unless the person had paused before.
  const pausedForWhy = useRef(false);
  useEffect(() => {
    if (p.whyOpen || !pausedForWhy.current) return;
    pausedForWhy.current = false;
    send({ type: "resume" });
  }, [p.whyOpen, send]);

  if (state.phase === "done")
    return (
      <main className="hf-body">
        <div className="hf-col">
          <p className="hf-status-line" role="status">
            Getting your answers ready…
          </p>
        </div>
      </main>
    );

  const from = p.advisorName === "your advisor" ? "" : `From ${p.advisorName}`;
  const segs = progressSegments(state);
  return (
    <>
      <main className="hf-body">
        <div className="hf-col" ref={top} tabIndex={-1} aria-label="Question cards">
          <div className="hf-deckhead">
            <h2>{progressLabel(state)}</h2>
            {from && <span>{from}</span>}
          </div>
          <ol className="hf-segs" aria-hidden="true">
            {segs.map((s, i) => (
              <li key={i} className={"is-" + s} />
            ))}
          </ol>

          <div className="hf-deck">
            {state.questions.map((q, i) => {
              const rel = i - shown;
              if (rel < -1 || rel > 2) return null;
              const isCurrent = i === state.idx && state.view == null;
              return (
                <Card
                  key={q.key}
                  rel={rel}
                  question={q}
                  status={cardStatus(state, i)}
                  current={isCurrent}
                  viewing={state.view === i}
                  paused={state.paused}
                  answer={state.answers[i]}
                  covered={isCurrent ? state.covered : (state.answers[i]?.covered ?? [])}
                  nudgeHint={isCurrent ? state.nudgeHint : null}
                  pulseKey={state.nudges}
                  typing={!voice}
                  onKeepTalking={() => send({ type: "keepTalking" })}
                  onAddMore={() => send({ type: "addMore" })}
                />
              );
            })}
          </div>

          <div className="hf-nav">
            {canPrev && (
              <button type="button" aria-label="Previous question" onClick={() => send({ type: "prev" })}>
                ← Previous
              </button>
            )}
            {state.view != null && (
              <button type="button" className="is-right" aria-label="Next question" onClick={() => send({ type: "fwd" })}>
                Next →
              </button>
            )}
          </div>

          {onCurrent && voice && !state.speechError && (
            <div className="hf-caption">
              <div className="hf-caption-head">
                <span className={"hf-caption-label" + (state.paused ? " is-paused" : "") + (recording ? " is-recording" : "")}>
                  {state.paused
                    ? "Paused · mic off"
                    : recording
                      ? `Recording · ${clock(backup.partMs)}`
                      : state.phase === "checking"
                        ? "Checking"
                        : "Listening…"}
                </span>
                <Bars live={live} level={level} />
              </div>
              {deckText(state).trim() ? (
                <p className="hf-caption-text">{captionTail(deckText(state))}</p>
              ) : (
                <p className="hf-caption-text is-empty">
                  {state.paused
                    ? "Tap Resume when you're ready"
                    : recording
                      ? "Keep talking. This phone is recording your answer."
                    : current?.isElse
                      ? "Start talking whenever you're ready, or tap No, that's all."
                      : "Start talking whenever you're ready"}
                </p>
              )}
              {!state.paused && backup.enabled && backup.trouble && (
                <p className="hf-caption-note" role="status" data-hf-backup>
                  {recording
                    ? state.offline
                      ? "No connection. Keep talking: this phone is recording, and we'll write it down when you're back online."
                      : "Live words are reconnecting. Keep talking: this phone is recording your answer, and we'll write it down."
                    : "Live words stopped. They come back on their own; you can also pause and resume."}
                  {recording && backup.partMs >= PART_WARN_MS && " This answer is getting long. It keeps recording; tap Next when you're done."}
                </p>
              )}
            </div>
          )}
          {(waiting || (remaining != null && remaining <= 3)) && (
            <p className="hf-small" role="status" data-hf-backup-queue>
              {waiting}
              {remaining != null && remaining <= 3 && (
                <>
                  {waiting && " "}
                  {remaining === 0
                    ? "No more recordings can be written down for these questions today. Keep talking only while live words show, or type."
                    : `Only ${remaining} more recording${remaining === 1 ? "" : "s"} can be written down for these questions today.`}
                </>
              )}
            </p>
          )}
          {onCurrent && voice && state.speechError && (
            <div className="hf-alert" role="alert">
              <p className="hf-alert-title">We couldn't hear that. Try again or type instead.</p>
              <div className="hf-row">
                <button type="button" className="hf-btn is-primary" onClick={() => send({ type: "retry" })}>
                  Try again
                </button>
                <button type="button" className="hf-btn" onClick={() => send({ type: "toText" })}>
                  Type instead
                </button>
              </div>
            </div>
          )}
          {onCurrent && !voice && (
            <div className="hf-typing" data-hf-typing>
              {state.micBlocked && !p.preview && (
                <p className="hf-note" role="status">
                  <strong>{(micBlock ?? "permission") === "permission" ? "Your microphone is blocked." : "Voice answers aren't available in this browser."}</strong> You can
                  type your answers instead. Same cards, same review.
                </p>
              )}
              <textarea
                aria-label={`Your answer to: ${current?.text ?? ""}`}
                aria-describedby="hf-typing-help"
                maxLength={4000}
                autoFocus
                placeholder="Type your answer…"
                value={state.typed}
                onChange={(e) => send({ type: "typed", text: e.target.value })}
              />
              <span id="hf-typing-help" className="hf-sr">
                Press Enter for the next card. Shift and Enter start a new line.
              </span>
            </div>
          )}
          {state.offline && <OfflineNotice quiet />}

          <div className="hf-extras">
            <details className="hf-keys">
              <summary>Keyboard shortcuts</summary>
              <dl>
                {SHORTCUTS.map(([k, what]) => (
                  <div key={k} style={{ display: "contents" }}>
                    <dt>
                      <kbd>{k}</kbd>
                    </dt>
                    <dd>{what}</dd>
                  </div>
                ))}
              </dl>
            </details>
            <button
              type="button"
              className="hf-link"
              onClick={() => {
                if (voice && !state.paused) {
                  pausedForWhy.current = true;
                  send({ type: "pause" });
                }
                p.onWhy();
              }}
            >
              Why am I being asked this?
            </button>
          </div>
        </div>
      </main>

      <footer className="hf-foot">
        <div className="hf-foot-in">
          {returnLabel ? (
            <button type="button" className="hf-btn is-primary" onClick={() => send({ type: "return" })}>
              {returnLabel}
            </button>
          ) : !voice ? (
            <div className="hf-row">
              {!p.preview && (
                <button type="button" className="hf-btn" onClick={() => send({ type: "toVoice" })}>
                  Use voice
                </button>
              )}
              {current?.isElse ? (
                <button type="button" className="hf-btn is-wide" onClick={() => send({ type: "finish" })}>
                  No, that's all
                </button>
              ) : (
                <button type="button" className="hf-btn" onClick={() => send({ type: "openSkip" })}>
                  Skip
                </button>
              )}
              <button type="button" className="hf-btn is-primary is-wide" onClick={() => send({ type: "next" })}>
                Next
              </button>
            </div>
          ) : (
            <>
              {/* Spoken cards never move on by themselves (October 18): Next lights up once every chip is heard. */}
              {!["got", "saved", "skipped"].includes(state.phase) && (
                <button
                  type="button"
                  className={"hf-btn hf-next" + (deckReady(state) ? " is-primary is-ready" : "")}
                  aria-label={deckReady(state) ? "Next. That covers it" : "Next"}
                  onClick={() => send({ type: "next" })}
                >
                  Next
                </button>
              )}
            <div className="hf-row">
              {state.paused ? (
                <button type="button" className="hf-btn is-primary is-wide" onClick={() => send({ type: "resume" })}>
                  Resume
                </button>
              ) : (
                <button type="button" className="hf-btn" onClick={() => send({ type: "pause" })}>
                  Pause
                </button>
              )}
              {current?.isElse ? (
                <button type="button" className="hf-btn is-wide" onClick={() => send({ type: "finish" })}>
                  No, that's all
                </button>
              ) : (
                <button type="button" className="hf-btn" onClick={() => send({ type: "openSkip" })}>
                  Skip
                </button>
              )}
              <button type="button" className="hf-btn" onClick={() => send({ type: "toText" })}>
                Type instead
              </button>
            </div>
            </>
          )}
        </div>
      </footer>

      {state.sheet && (
        <Sheet label="Skip this one?" onClose={() => send({ type: "closeSkip" })}>
          <h2>Skip this one?</h2>
          <p>Pick whichever fits. Any of these is fine.</p>
          <div className="hf-sheet-options">
            {SKIPS.map((o) => (
              <button key={o.reason} type="button" className="hf-btn" onClick={() => send({ type: "skip", reason: o.reason })}>
                {o.label}
              </button>
            ))}
          </div>
          <button type="button" className="hf-btn" onClick={() => send({ type: "closeSkip" })}>
            Keep answering
          </button>
        </Sheet>
      )}
      <LiveRegion text={webAnnouncement(state.announce)} id={state.announceId} />
    </>
  );
}

/**
 * One question card. Its border and background ease to sage when DutyGraph has what it needs; the
 * check pops in. Skipped cards go grey, "Anything else?" is violet. While Checking the edge glows.
 * Cards that are not on screen are hidden from screen readers and cannot be clicked.
 */
function Card(p: {
  rel: number;
  question: HandsFreeQuestion;
  status: DeckPhase | "idle";
  current: boolean;
  viewing: boolean;
  paused: boolean;
  answer: CardAnswer | null;
  covered: string[];
  nudgeHint: string | null;
  pulseKey: number;
  typing: boolean;
  onKeepTalking: () => void;
  onAddMore: () => void;
}) {
  const q = p.question;
  const sage = p.status === "got" || p.status === "saved";
  const skipped = p.status === "skipped";
  const showPaused = p.current && p.paused && !sage && !skipped;
  const checking = p.current && p.status === "checking" && !p.paused;
  const hint = p.current && p.nudgeHint && !sage && !skipped ? q.hints.find((h) => h.id === p.nudgeHint) : undefined;
  const label = sage ? (p.status === "saved" ? "Saved" : "Got it") : skipped ? SKIP_LABELS[p.answer?.reason ?? "skip"] : "";
  const cls = ["hf-card", q.isElse && !sage && !skipped && "is-else", sage && "is-sage", skipped && "is-skipped", checking && "is-checking"].filter(Boolean).join(" ");
  const covered = skipped ? [] : p.covered;
  return (
    <article className={cls} data-rel={p.rel} aria-hidden={p.rel !== 0} aria-label={q.isElse ? "One last thing" : `Question ${q.index + 1}`}>
      <div className="hf-card-head">
        {sage ? (
          <span className="hf-status is-sage">
            <span className="hf-dot">
              <CheckIcon />
            </span>
            {label}
          </span>
        ) : skipped ? (
          <span className="hf-status is-skipped">
            <span className="hf-dot">
              <SkipIcon />
            </span>
            {label}
          </span>
        ) : showPaused ? (
          <span className="hf-status is-paused">
            <span className="hf-dot">
              <PauseIcon />
            </span>
            Paused
          </span>
        ) : (
          <span className={"hf-eyebrow" + (q.isElse ? " is-violet" : "")}>{q.isElse ? "One last thing" : `Question ${q.index + 1}`}</span>
        )}
        {p.current && sage && (
          <button type="button" className="hf-undo" onClick={p.onKeepTalking}>
            {p.typing ? "Keep typing" : "Keep talking"}
          </button>
        )}
      </div>
      <h3 className="hf-q">{q.text}</h3>
      {hint && (
        <p className="hf-nudge" key={`${hint.id}-${p.pulseKey}`}>
          {hint.nudge}
        </p>
      )}
      {p.viewing && (
        <p className="hf-said">
          <span>You said: </span>
          {youSaid(p.answer?.raw ?? "")}
        </p>
      )}
      <div className="hf-card-fill" />
      {p.viewing ? (
        <button type="button" className="hf-btn is-small" aria-label={`Add more to question ${q.index + 1}`} onClick={p.onAddMore}>
          Add more
        </button>
      ) : (
        q.hints.length > 0 && (
          <div>
            <div className="hf-cover">Try to cover</div>
            <ul className="hf-chips">
              {q.hints.map((h) => {
                const hit = covered.includes(h.id);
                const nudged = !hit && p.current && !sage && !skipped && p.nudgeHint === h.id;
                return (
                  <li key={nudged ? `${h.id}-${p.pulseKey}` : h.id} className={"hf-chip" + (hit ? " is-hit" : "") + (nudged ? " is-nudged" : "")}>
                    {hit && <CheckIcon size={12} />}
                    {h.label}
                    {hit && <span className="hf-sr">, covered</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )
      )}
    </article>
  );
}
