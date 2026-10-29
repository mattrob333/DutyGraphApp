import test from "node:test";
import assert from "node:assert/strict";
import * as fixtures from "../src/earn-fixtures.ts";

test("development checks flag the explicit meeting and timesheet examples", () => {
  for (const title of ["Attend meetings", "Submit timesheets"]) {
    const card = fixtures.manualEarnCard();
    card.title = title;
    const checks = fixtures.earnChecks(card);
    assert.equal(checks.generic.flagged, true, title);
    assert.equal(checks.earnHint, "not_yet");
    assert.ok(checks.earnHintReasons.includes("too_generic"));
  }
});

test("opt-in warning scenarios model generic, duplicate and split review states", () => {
  const scenarios = fixtures.earnFairnessScenarios();
  assert.deepEqual(scenarios.map((s) => s.kind), ["generic", "duplicate", "split"]);
  for (const scenario of scenarios) {
    assert.equal(scenario.checks.earnHint, "not_yet");
    assert.equal(scenario.checks.readyToHandOff, true);
    if (scenario.kind === "generic") {
      assert.equal(scenario.checks.generic.flagged, true);
    } else {
      assert.ok(scenario.checks.earnHintReasons.includes("already_mapped"));
      assert.equal(scenario.checks.possibleDuplicates[0].title, "Restock the service van");
      assert.equal(scenario.checks.possibleDuplicates[0].ownerName, "Dana Cole");
    }
  }
  // Each request receives fresh data, rather than shared mutable checks.
  scenarios[1].checks.possibleDuplicates.length = 0;
  assert.equal(fixtures.earnFairnessScenarios()[1].checks.possibleDuplicates.length, 1);
});
