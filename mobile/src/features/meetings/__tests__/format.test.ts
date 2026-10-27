import { describe, expect, it } from "@jest/globals";
import {
  formatRemaining,
  formatWindow,
  groupMeetings,
  isSafeJoinUrl,
  meetingKicker,
  meetingWindows,
  meetingClock,
  minutesLabel,
  providerName,
} from "../format";
import type { MeetingSummary } from "@/types/domain";

const at = (h: number, m: number) => new Date(2026, 8, 28, h, m, 0, 0);

describe("meeting windows", () => {
  it("collapses a shared meridiem", () => {
    expect(formatWindow(at(14, 0), at(14, 15))).toBe("2:00–2:15 PM");
  });
  it("keeps both meridiems across noon", () => {
    expect(formatWindow(at(11, 45), at(12, 15))).toBe("11:45 AM–12:15 PM");
  });
  it("computes current and original windows", () => {
    const w = meetingWindows({
      startsAt: at(14, 0).toISOString(),
      endsAt: at(14, 15).toISOString(),
      originalDurationMinutes: 60,
    });
    expect(w).toEqual({ current: "2:00–2:15 PM", original: "2:00–3:00 PM" });
  });
  it("falls back to newDurationMinutes when there is no end", () => {
    expect(
      meetingWindows({
        startsAt: at(14, 0).toISOString(),
        newDurationMinutes: 14,
      }).current,
    ).toBe("2:00–2:14 PM");
  });
  it("returns nothing without a start", () => {
    expect(meetingWindows({})).toEqual({});
  });
  it("builds the kicker", () => {
    expect(meetingKicker(at(11, 0).toISOString(), "Ops")).toBe("11:00 · Ops");
    expect(meetingKicker(undefined, "Ops")).toBe("Ops");
  });
});

describe("countdown", () => {
  const end = at(14, 15).toISOString();
  it("counts down deterministically", () => {
    expect(formatRemaining(end, at(14, 0).getTime())).toBe("15:00");
    expect(formatRemaining(end, at(14, 14).getTime() + 30_000)).toBe("0:30");
  });
  it("never goes negative", () => {
    expect(formatRemaining(end, at(15, 0).getTime())).toBe("0:00");
  });
  it("handles hours and bad input", () => {
    expect(formatRemaining(at(15, 30).toISOString(), at(14, 0).getTime())).toBe(
      "1:30:00",
    );
    expect(formatRemaining("nope", 0)).toBe("--:--");
  });
});

describe("join url validation", () => {
  it("accepts https only", () => {
    expect(isSafeJoinUrl("https://meet.google.com/abc")).toBe(true);
    expect(isSafeJoinUrl("http://meet.google.com/abc")).toBe(false);
    expect(isSafeJoinUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeJoinUrl("tel:+123")).toBe(false);
    expect(isSafeJoinUrl("not a url")).toBe(false);
    expect(isSafeJoinUrl(undefined)).toBe(false);
  });
});

describe("groupMeetings", () => {
  const m = (id: string, group: MeetingSummary["group"]): MeetingSummary => ({
    id,
    title: id,
    group,
    whenLabel: "",
    outcome: "PENDING",
    statusLine: "",
    tone: "plain",
    route: "",
  });
  it("orders groups and drops empty ones", () => {
    const g = groupMeetings([
      m("a", "RECENT"),
      m("b", "ASYNC"),
      m("c", "RECENT"),
    ]);
    expect(g.map((x) => x.label)).toEqual(["Async", "Recent"]);
    expect(g[1].items.map((x) => x.id)).toEqual(["a", "c"]);
  });
});

describe("meeting display fallbacks", () => {
  it("omits unavailable clock values and never renders an invalid date", () => {
    expect(meetingClock(undefined)).toBeUndefined();
    expect(meetingClock("invalid")).toBeUndefined();
    expect(meetingClock(at(0, 5).toISOString())).toBe("12:05 AM");
    expect(meetingWindows({ startsAt: "invalid" })).toEqual({});
    expect(
      meetingWindows({ startsAt: at(14, 0).toISOString(), endsAt: "invalid" }),
    ).toEqual({});
    expect(meetingKicker("invalid", "Planning")).toBe("Planning");
  });
  it("uses singular only for one minute and names all supported providers", () => {
    expect(minutesLabel(1)).toBe("1 minute");
    expect(minutesLabel(2)).toBe("2 minutes");
    expect(
      ["GOOGLE_MEET", "TEAMS", "ZOOM", "PHONE", "IN_PERSON", "OTHER"].map(
        (provider) =>
          providerName(provider as Parameters<typeof providerName>[0]),
      ),
    ).toEqual([
      "Google Meet",
      "Microsoft Teams",
      "Zoom",
      "the call",
      "the room",
      "the meeting",
    ]);
  });
});
