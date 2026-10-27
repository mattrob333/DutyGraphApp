import { useState } from "react";
import { CircleCheck } from "lucide-react";
import "./task-review-card.css";
const fields: Record<string, string> = {
  title: "Task name",
  duty: "Responsibility",
  purpose: "Purpose · why I do this task",
  trigger: "Trigger · when this task starts",
  inputs: "Inputs · what I receive and from whom",
  instructions: "Steps · how I do the work",
  output: "Output · what complete looks like",
  handoff: "Handoff · who depends on my result",
  software: "Software I use",
  humanGate: "Checks and approvals · my understanding",
};
export function TaskReviewCard({
  card,
  person,
  disabled = false,
  onChange,
}: {
  card: any;
  person?: string;
  disabled?: boolean;
  onChange: (c: any) => void;
}) {
  const [editing, setEditing] = useState(false);
  const approved = card.decision === "correct" && !editing;
  const visibleFields = Object.entries(fields).filter(
    ([key]) =>
      !["purpose", "trigger", "humanGate"].includes(key) ||
      card[key] !== undefined,
  );
  return (
    <article className={`task-review-card${approved ? " is-approved" : ""}`}>
      <header>
        <small>MY WORK · TASK DESCRIPTION</small>
        <h3>{card.title}</h3>
        {person && <p>{person}</p>}
        <strong className="task-review-status" aria-live="polite">
          {approved && <CircleCheck size={18} aria-hidden="true" />}
          {approved ? "Confirmed · ready to send" : "Ready for your review"}
        </strong>
      </header>
      {editing ? (
        <div className="task-review-fields">
          {visibleFields.map(([key, label]) => (
            <label key={key}>
              {label}
              <textarea
                aria-label={label}
                rows={key === "instructions" ? 5 : 2}
                maxLength={
                  key === "title" || key === "duty"
                    ? 200
                    : key === "software"
                      ? 1000
                      : 3000
                }
                value={card[key] || ""}
                disabled={disabled}
                onChange={(e) =>
                  onChange({ ...card, [key]: e.target.value, decision: "" })
                }
              />
            </label>
          ))}
        </div>
      ) : (
        <dl>
          {visibleFields
            .filter(([k]) => k !== "title")
            .map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {key === "instructions" && card[key] ? (
                    <ol>
                      {card[key]
                        .split(/\n+/)
                        .filter(Boolean)
                        .map((s: string, i: number) => (
                          <li key={i}>{s.replace(/^\d+[.)]\s*/, "")}</li>
                        ))}
                    </ol>
                  ) : (
                    card[key] ||
                    "Not stated in your answer. Review it with your advisor."
                  )}
                </dd>
              </div>
            ))}
        </dl>
      )}
      <footer>
        <button
          type="button"
          className="task-approve"
          disabled={disabled}
          aria-disabled={approved || disabled}
          onClick={() => {
            if (editing) setEditing(false);
            else if (!approved) onChange({ ...card, decision: "correct" });
          }}
        >
          {approved && (
            <CircleCheck
              className="task-approval-check"
              size={20}
              aria-hidden="true"
            />
          )}
          {editing
            ? "Save the changes"
            : approved
              ? "Confirmed"
              : "Confirm"}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setEditing(!editing);
            if (!editing) onChange({ ...card, decision: "" });
          }}
        >
          {editing ? "Close editor" : "Edit"}
        </button>
      </footer>
    </article>
  );
}
