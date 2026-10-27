import { useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { api } from "../api.ts";
import { buildQuestions, type StoredQuestionHints } from "../../../shared/hands-free/hints.ts";
import { applyRecorded } from "../../../shared/hands-free/recorded.ts";
import type { QuestionKey } from "../../../shared/hands-free/types.ts";
import { BackupQueue, recordingType, type BackupView } from "./backup.ts";
import type { TeamRequest } from "../TeamLink.tsx";
import { DeckScreen } from "./DeckScreen.tsx";
import {
  backupPrivacyLine,
  draftKey,
  firstName,
  flowReducer,
  initialFlow,
  newDraft,
  parseDraft,
  privacyLines,
  speechServiceLine,
  type HandsFreeDraft,
} from "./flow-model.ts";
import { ConsentScreen, IntroScreen } from "./IntroScreen.tsx";
import { Sheet } from "./parts.tsx";
import { ReviewScreen, SentScreen } from "./ReviewScreen.tsx";
import { createSpeechSource } from "./speech/index.ts";
import type { SpeechSourceKind } from "./speech/types.ts";
import "./handsfree.css";

/** "Allow microphone and start" was accepted on this device (the browser keeps its own permission). */
export const CONSENT_KEY = "dutygraph.handsfree.micConsent";
const storage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};
export const consentGiven = () => {
  try {
    return storage()?.getItem(CONSENT_KEY) === "1";
  } catch {
    return false;
  }
};
export const rememberConsent = () => {
  try {
    storage()?.setItem(CONSENT_KEY, "1");
  } catch {
    /* Private windows can block storage; the explanation then shows again next time. */
  }
};

const noBackup: BackupView = { clips: [], results: [], remaining: null, online: true };
const noSubscribe = () => () => {};

/**
 * The team link's questions as hands-free cards (docs/specs/COMPANION-HANDS-FREE.md §9.3):
 * intro → microphone consent (first time) → the deck → Here's what we heard → sent. The answers
 * are a draft on this device until the person sends them with the same POST /invitations/:token/team
 * body as TeamFlow. In the advisor's preview nothing is saved, asked or sent, and the cards are typed.
 */
export function HandsFreeTeamFlow(p: { token?: string; name: string; request: TeamRequest; preview: boolean }) {
  const r = p.request;
  const live = !p.preview && !!p.token;
  const questions = useMemo(
    () => buildQuestions((r.questions || []).slice(0, 12), { advisorName: r.advisorName, stored: (r.questionHints as StoredQuestionHints | undefined) ?? null }),
    [r.questions, r.advisorName, r.questionHints],
  );
  const [draft, setDraft] = useState<HandsFreeDraft | null>(() => (live ? parseDraft(storage()?.getItem(draftKey(r.id)), questions) : null));
  const [flow, dispatch] = useReducer(flowReducer, draft, initialFlow);
  const [why, setWhy] = useState(false);
  const [speechKind, setSpeechKind] = useState<SpeechSourceKind | null>(null);
  const [took, setTook] = useState("");

  // The recorded backup (backup.ts): one queue for this ask on this device, kept across screens and
  // reloads. With the company's OpenAI key the link's route turns recordings into text; else this device.
  const canRecord = useMemo(() => live && !!recordingType(), [live]);
  const [backup, setBackup] = useState<BackupQueue | undefined>(undefined);
  useEffect(() => {
    if (!canRecord) return setBackup(undefined);
    // Made in the effect (not in render), so React's development double mount cannot close the one in use.
    const q = new BackupQueue(r.id, r.voiceConfigured ? `/api/invitations/${p.token}/team/transcribe` : undefined);
    setBackup(q);
    return () => q.close();
  }, [canRecord, r.id, r.voiceConfigured, p.token]);
  const backupView = useSyncExternalStore(backup?.subscribe ?? noSubscribe, backup?.getView ?? (() => noBackup));
  // Off the deck (the review), texts go straight into the draft; on the deck, the deck puts them in.
  useEffect(() => {
    if (!backup || flow.screen === "deck" || !backupView.results.length) return;
    for (const res of backupView.results) {
      setDraft((d) => {
        if (!d) return d;
        const q = questions[res.idx];
        if (!q) return d;
        const answers = [...d.answers];
        answers[res.idx] = applyRecorded(answers[res.idx], q, res.replace, res.text, res.via, res.before);
        const edits = { ...(d.edits ?? {}) };
        delete edits[res.key];
        // New words: the polished text is asked for again.
        return { ...d, answers, edits, understood: undefined };
      });
      backup.consume(res.id);
    }
  }, [backup, backupView, flow.screen, questions]);

  // The draft follows every change; it goes once the answers are sent.
  useEffect(() => {
    if (!live || !draft || flow.screen === "sent") return;
    try {
      storage()?.setItem(draftKey(r.id), JSON.stringify(draft));
    } catch {
      /* Draft storage is optional: the page works without it. */
    }
  }, [draft, live, r.id, flow.screen]);

  const advisor = r.advisorName?.trim() || "your advisor";
  const advisorFirst = firstName(r.advisorName) || "your advisor";
  const company = r.companyName || "your company";
  const update = (patch: Partial<HandsFreeDraft>) => setDraft((d) => ({ ...(d ?? newDraft(questions, flow.mode)), ...patch }));

  // A new screen: focus its heading, so a screen reader starts there (the deck focuses its own column).
  const root = useRef<HTMLDivElement | null>(null);
  const firstScreen = useRef(true);
  useEffect(() => {
    if (firstScreen.current) {
      firstScreen.current = false;
      return;
    }
    if (flow.screen !== "deck") root.current?.querySelector<HTMLElement>("h1")?.focus({ preventScroll: true });
  }, [flow.screen]);

  const shell = (screen: string, back: (() => void) | null, children: ReactNode) => (
    <div ref={root} className={"hf" + (p.preview ? " is-embedded" : "")} data-screen={screen}>
      <header className="hf-top">
        <span className="hf-brand">DutyGraph</span>
        <span className="hf-for">{[...new Set([r.companyName, r.firmName].filter(Boolean))].join(" · ")}</span>
        {back && (
          <button type="button" className="hf-btn" onClick={back}>
            Back
          </button>
        )}
      </header>
      {children}
      {why && (
        <Sheet label="Why am I being asked this?" kind="why" onClose={() => setWhy(false)}>
          <h2>Why am I being asked this?</h2>
          <p>
            {advisor} records how work runs at {company}. The goal is clear, written steps and easier slow parts. Your answer is about your work. It is not a
            test of you.
          </p>
          <p>{r.notice || "Only your advisor sees your answers. Share only what is approved for this engagement."}</p>
          <p>{privacyLines(advisorFirst).join(" ")}</p>
          <p>{speechServiceLine(p.preview ? null : speechKind)} You can type your answers instead.</p>
          {canRecord && <p>{backupPrivacyLine(!!r.voiceConfigured)}</p>}
          <button type="button" className="hf-btn" onClick={() => setWhy(false)}>
            Close
          </button>
        </Sheet>
      )}
    </div>
  );

  if (flow.screen === "intro")
    return shell(
      "intro",
      null,
      <IntroScreen
        request={r}
        questions={questions}
        started={!!draft?.answers.some(Boolean)}
        preview={p.preview}
        micChoice={live && consentGiven()}
        onWhy={() => setWhy(true)}
        onVoice={() => {
          if (!draft) setDraft(newDraft(questions, "voice"));
          dispatch(p.preview ? { type: "typeInstead" } : { type: "startVoice", consented: consentGiven() });
        }}
        onType={() => {
          if (!draft) setDraft(newDraft(questions, "text"));
          dispatch({ type: "typeInstead" });
        }}
      />,
    );

  if (flow.screen === "consent")
    return shell(
      "consent",
      () => dispatch({ type: "back" }),
      <ConsentScreen
        advisorFirst={advisorFirst}
        onConsent={rememberConsent}
        onAllowed={() => dispatch({ type: "allowed" })}
        onDenied={(reason) => dispatch({ type: "denied", reason })}
        onType={() => dispatch({ type: "typeInstead" })}
        backupLine={canRecord ? backupPrivacyLine(!!r.voiceConfigured) : undefined}
      />,
    );

  if (flow.screen === "deck")
    return shell(
      "deck",
      () => dispatch({ type: "back" }),
      <DeckScreen
        key={flow.run}
        questions={questions}
        advisorName={advisor}
        mode={flow.mode}
        micBlocked={flow.micBlocked}
        answers={draft?.answers}
        preview={p.preview}
        speech={live ? (preferred) => createSpeechSource({ token: p.token!, api, preferred }) : undefined}
        checkCoverage={
          live
            ? (questionKey: QuestionKey, text: string) =>
                api<{ available: boolean; covered?: string[] }>(`/invitations/${p.token}/team/coverage`, "POST", { questionKey, text: text.slice(0, 4000) }).then((res) =>
                  res.available && Array.isArray(res.covered) ? res.covered : null,
                )
            : undefined
        }
        onSpeechKind={setSpeechKind}
        backup={backup}
        whyOpen={why}
        onWhy={() => setWhy(true)}
        onAnswers={(answers, mode) =>
          setDraft((d) => {
            const base = d ?? newDraft(questions, mode);
            // New words make the polished text and the edits stale; the same answers keep them.
            if (JSON.stringify(base.answers) !== JSON.stringify(answers)) return { ...base, answers, mode, stage: "deck", understood: undefined, edits: {} };
            return base.mode === mode ? base : { ...base, mode };
          })
        }
        onDone={(answers) => {
          update({ answers, stage: "review" });
          dispatch({ type: "deckDone" });
        }}
      />,
    );

  if (flow.screen === "review" && draft)
    return shell(
      "review",
      null,
      <ReviewScreen
        token={p.token}
        preview={p.preview}
        version={r.version}
        advisorName={advisor}
        advisorFirst={firstName(r.advisorName)}
        questions={questions}
        draft={draft}
        update={update}
        backup={backup}
        backupView={backupView}
        onRestart={() => {
          backup?.clear();
          setDraft(newDraft(questions, draft.mode));
          dispatch({ type: "restart" });
        }}
        onSent={(label) => {
          backup?.clear();
          setTook(label);
          try {
            storage()?.removeItem(draftKey(r.id));
          } catch {
            /* Sent already. */
          }
          dispatch({ type: "sent" });
        }}
      />,
    );

  return shell("sent", null, <SentScreen name={p.name} advisorName={advisor} took={took} />);
}
