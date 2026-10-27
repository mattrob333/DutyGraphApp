import { useEffect, useRef, useState, type ReactNode } from "react";
import { barScales } from "../sponsor/live-voice-model.ts";
import { OFFLINE_TEXT } from "./flow-model.ts";

/** Small pieces the hands-free screens share: icons, the level bars, notices, sheets. */

export const CheckIcon = ({ size = 16, stroke = 2.2 }: { size?: number; stroke?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const SkipIcon = ({ size = 15 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
export const PauseIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="5" y="4" width="4.5" height="16" rx="1" />
    <rect x="14.5" y="4" width="4.5" height="16" rx="1" />
  </svg>
);

/** The online state of the browser (navigator.onLine and its events). */
export function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/**
 * The caption box's seven bars. While the microphone is on they follow its level (read in an
 * animation frame, so the page does not re-render ten times a second); otherwise a flat line.
 */
export function Bars({ live, level }: { live: boolean; level: () => number }) {
  const box = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    if (!live) return;
    const bars = box.current ? (Array.from(box.current.children) as HTMLElement[]) : [];
    let id = 0;
    const tick = () => {
      barScales(level(), bars.length).forEach((s, i) => (bars[i].style.transform = `scaleY(${s})`));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [live, level]);
  if (!live)
    return (
      <span className="hf-bars is-off" aria-hidden="true">
        <span />
      </span>
    );
  return (
    <span ref={box} className="hf-bars" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <span key={i} />
      ))}
    </span>
  );
}

/** Announcements for screen readers. The same words said twice are read twice (a hidden space flips). */
export function LiveRegion({ text, id }: { text: string; id: number }) {
  return (
    <div className="hf-sr" role="status" aria-live="polite" aria-atomic="true">
      {text}
      {id % 2 ? " " : ""}
    </div>
  );
}

/** `quiet` where the deck's own announcement already says it. */
export function OfflineNotice({ quiet }: { quiet?: boolean }) {
  return (
    <p className="hf-offline" role={quiet ? undefined : "status"}>
      {OFFLINE_TEXT}
    </p>
  );
}

/**
 * A modal sheet: Esc and a tap outside close it, focus moves into it and back to where it was.
 * `kind="why"` is a centered card on a laptop; the skip sheet rises from the bottom.
 */
export function Sheet(p: { label: string; onClose: () => void; children: ReactNode; kind?: "skip" | "why" }) {
  const card = useRef<HTMLDivElement | null>(null);
  const close = useRef(p.onClose);
  close.current = p.onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    card.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close.current();
      }
      // Keep Tab inside the sheet.
      if (e.key === "Tab" && card.current) {
        const all = Array.from(card.current.querySelectorAll<HTMLElement>("button, [href], select, textarea, input"));
        if (!all.length) return;
        const first = all[0];
        const last = all[all.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      before?.focus?.();
    };
  }, []);
  return (
    <div className={"hf-scrim" + (p.kind === "why" ? " hf-why" : "")} onClick={() => p.onClose()}>
      <div ref={card} className="hf-sheet" role="dialog" aria-modal="true" aria-label={p.label} onClick={(e) => e.stopPropagation()}>
        {p.children}
      </div>
    </div>
  );
}
