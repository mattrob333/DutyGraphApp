import { expect, it } from "@jest/globals";
import { CompanionApiError } from "@/types/domain";
import { errorMessage } from "../States";

it("explains an ambiguous timeout without claiming offline status or automatic retry", () => {
  const message = errorMessage(new CompanionApiError("REQUEST_TIMEOUT", "Timed out", 0, true));
  expect(message).toContain("may still have been received");
  expect(message).toContain("same action again");
  expect(message).not.toMatch(/offline|we'll try/i);
});

it("preserves reconnection instructions when a stale advisor operation has status zero", () => {
  expect(errorMessage(new CompanionApiError("SESSION_ENDED", "Pair this phone again to continue.", 0, false)))
    .toBe("Pair this phone again to continue.");
});

it("asks for an explicit connection retry without promising background work", () => {
  expect(errorMessage(new CompanionApiError("NETWORK_OFFLINE", "Offline", 0, true)))
    .toBe("Couldn't connect. Check your connection and try again.");
});
