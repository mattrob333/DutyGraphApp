import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { Button, ErrorBox, Panel } from "./ui.tsx";
import "./team-link.css";

type Card = {
  id: string;
  title: string;
  version: number;
  duty: string;
  purpose: string;
  trigger: string;
  inputs: string[];
  instructions: string[];
  output: string;
  systems: string[];
  destination: string;
};
type Check = { id: string; version: number; title: string; dueDate?: string; notice?: string; cards: Card[] };
type Decision = "correct" | "needs_change" | "not_mine" | "unsure";
const CHOICES: { id: Decision; label: string }[] = [
  { id: "correct", label: "This is right" },
  { id: "needs_change", label: "Needs a change" },
  { id: "not_mine", label: "Not my work" },
  { id: "unsure", label: "Not sure" },
];
const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
/**
 * "Check what we understood" without an account (TEAM-01-08): the participant
 * reads each task card from their private link and confirms or corrects it.
 */
export function TaskCheckLink({ token, name }: { token: string; name: string }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  useEffect(() => {
    api<Check>(`/invitations/${token}/check`).then(setCheck).catch((e) => setError((e as Error).message));
  }, [token]);
  if (done)
    return (
      <Panel title="Your check has been sent">
        <p>Thank you, {name}. Your advisor has your answers. Your check records your understanding. It does not change your duties or approve anything. You can close this page.</p>
      </Panel>
    );
  const ready = !!check && check.cards.every((c) => decisions[c.id] && (decisions[c.id] !== "needs_change" || notes[c.id]?.trim()));
  return (
    <Panel title="Check what we understood about your work">
      <p>Read each description. Tell us if it is right, what should change, or if it is not your work. You do not need an account or a password.</p>
      <ErrorBox error={error} />
      {check && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await api(`/invitations/${token}/check`, "POST", { expectedVersion: check.version, decisions, notes });
              setDone(true);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {check.dueDate && <p className="subtle">Please answer by {check.dueDate}.</p>}
          <ol className="task-check-cards">
            {check.cards.map((c) => (
              <li key={c.id}>
                <h3>{c.title}</h3>
                {c.duty && <p><strong>Duty:</strong> {c.duty}</p>}
                {c.trigger && <p><strong>Starts when:</strong> {c.trigger}</p>}
                {!!list(c.inputs).length && <p><strong>You receive:</strong> {list(c.inputs).join("; ")}</p>}
                {!!list(c.instructions).length && (
                  <ol>
                    {list(c.instructions).map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                )}
                {!!list(c.systems).length && <p><strong>Systems:</strong> {list(c.systems).join(", ")}</p>}
                {c.output && <p><strong>Result:</strong> {c.output}</p>}
                {c.destination && <p><strong>Goes to:</strong> {c.destination}</p>}
                <div role="radiogroup" aria-label={`Your answer for ${c.title}`} className="task-check-choices">
                  {CHOICES.map((o) => (
                    <label key={o.id}>
                      <input
                        type="radio"
                        name={`d-${c.id}`}
                        checked={decisions[c.id] === o.id}
                        onChange={() => setDecisions((d) => ({ ...d, [c.id]: o.id }))}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
                {(decisions[c.id] === "needs_change" || decisions[c.id] === "not_mine") && (
                  <label>
                    {decisions[c.id] === "needs_change" ? "What should change?" : "Who does this work? (optional)"}
                    <textarea maxLength={2000} rows={3} value={notes[c.id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))} />
                  </label>
                )}
              </li>
            ))}
          </ol>
          <Button primary type="submit" disabled={busy || !ready}>
            {busy ? "Sending…" : "Send my check"}
          </Button>
        </form>
      )}
    </Panel>
  );
}
