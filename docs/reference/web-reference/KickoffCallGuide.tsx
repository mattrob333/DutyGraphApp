import { useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, MessageSquare, PencilLine } from "lucide-react";
import { kickoffGuide } from "../../shared/kickoff-guide.ts";
import { Button, Field } from "./ui.tsx";

export function KickoffCallGuide({
  guide,
  answers,
  onAnswer,
  transcript,
  onTranscript,
  children,
}: {
  guide: ReturnType<typeof kickoffGuide>;
  answers: Record<string, string>;
  onAnswer: (id: string, value: string) => void;
  transcript: string;
  onTranscript: (value: string) => void;
  children: ReactNode;
}) {
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const topic = guide.sections[index];
  const select = (next: number) => {
    setIndex(next);
    requestAnimationFrame(() =>
      heading.current?.focus({ preventScroll: true }),
    );
  };
  return (
    <section
      className="kickoff-call"
      id="kickoff-call"
      aria-label="Leadership call workspace"
    >
      <header className="kickoff-call-heading">
        <span className="eyebrow">On the call · advisor-led conversation</span>
        <h2>Understand the business, together.</h2>
        <p>
          Confirm the context. Follow a real example. Agree who does what next.
        </p>
        <small>
          Unsaved notes: keep Discovery open until you save the outcomes below.
          “Notes added” records typing, not verified coverage.
        </small>
      </header>
      <div className="kickoff-call-grid">
        <nav aria-label="Meeting topics" className="kickoff-topics">
          {guide.sections.map((s, i) => (
            <button
              type="button"
              key={s.id}
              aria-current={index === i ? "step" : undefined}
              onClick={() => select(i)}
            >
              <span className="kickoff-topic-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>
                <strong>{s.title}</strong>
                <small>
                  {answers[s.id]?.trim()
                    ? "Notes added · unsaved"
                    : "Open conversation"}
                </small>
              </span>
            </button>
          ))}
        </nav>
        <section
          className="kickoff-conversation"
          aria-labelledby="kickoff-topic-heading"
        >
          <span className="eyebrow">
            Conversation {index + 1} of {guide.sections.length}
          </span>
          <h3 id="kickoff-topic-heading" ref={heading} tabIndex={-1}>
            {topic.title}
          </h3>
          <div className="kickoff-lead-question">
            <MessageSquare size={22} aria-hidden="true" />
            <p>{topic.questions[0]}</p>
          </div>
          <details className="kickoff-followups">
            <summary>Go deeper · follow-up prompt</summary>
            <p>{topic.questions[1]}</p>
          </details>
          {topic.id === "business" && (
            <details className="kickoff-followups">
              <summary>Company-specific flows to validate</summary>
              {guide.profileMissing ? (
                <p>
                  No operating model selected. Establish how the business
                  delivers value before assuming a process.
                </p>
              ) : (
                guide.models.map((model) => (
                  <section key={model.id}>
                    <h4>{model.name}</h4>
                    <p className="kickoff-flow">{model.stages.join(" → ")}</p>
                    <p>{model.probe}</p>
                  </section>
                ))
              )}
            </details>
          )}
          <Field label={`${topic.title} — meeting notes`}>
            <textarea
              rows={7}
              maxLength={2000}
              value={answers[topic.id] || ""}
              onChange={(e) => onAnswer(topic.id, e.target.value)}
              placeholder="Capture their answer. Name the owner, example and evidence. Record disagreements and unknowns. Assign a follow-up where needed."
            />
          </Field>
          <div className="kickoff-topic-actions">
            <Button disabled={index === 0} onClick={() => select(index - 1)}>
              <ArrowLeft size={16} /> Previous topic
            </Button>
            {index < guide.sections.length - 1 ? (
              <Button primary onClick={() => select(index + 1)}>
                Next topic <ArrowRight size={16} />
              </Button>
            ) : (
              <Button
                primary
                onClick={() =>
                  document
                    .getElementById("kickoff-save")
                    ?.scrollIntoView({ block: "center" })
                }
              >
                Review & save outcomes <ArrowRight size={16} />
              </Button>
            )}
          </div>
        </section>
      </div>
      <details className="kickoff-transcript">
        <summary>
          <PencilLine size={16} aria-hidden="true" /> Transcript or additional
          notes{transcript.trim() ? " · Notes added" : ""}
        </summary>
        <Field label="Transcript or additional meeting notes">
          <textarea
            rows={10}
            value={transcript}
            maxLength={20000}
            onChange={(e) => onTranscript(e.target.value)}
            placeholder="Paste a transcript or capture additional notes. This screen does not record or transcribe audio."
          />
        </Field>
      </details>
      <div id="kickoff-save" className="kickoff-save">
        {children}
      </div>
    </section>
  );
}
