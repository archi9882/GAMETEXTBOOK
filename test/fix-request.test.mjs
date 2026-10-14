// Tests for the fix request the player pastes back to the chat AI (framework 4.6, design spec 4.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFixRequest, nextFixNumber } from "../app/fix-request.js";

const rec = (issues, imports = [{ part: "head" }]) => ({ id: "w1", issues, imports });

test("nextFixNumber continues after the highest fix part", () => {
  assert.equal(nextFixNumber(rec({}, [{ part: "head" }])), 1);
  assert.equal(nextFixNumber(rec({}, [{ part: "fix-1" }, { part: "fix-3" }, { part: "ch2" }])), 4);
});

test("buildFixRequest returns null when there is nothing to fix", () => {
  assert.equal(buildFixRequest(rec({ errors: [], warnings: ["a: unknown skill x (not generated yet?)"] })), null);
});

test("buildFixRequest lists errors and real warnings in English and names the next part", () => {
  const text = buildFixRequest(rec({
    errors: ["practices[p1].question: duplicate option"],
    warnings: ["clusters[c1]: unknown skill x (not generated yet?)", "bosses[b].steps[1]: same answer as the previous step (2 A)"],
  }, [{ part: "head" }, { part: "fix-1" }]));
  assert.match(text, /fix-2/);
  assert.match(text, /world: w1/);
  assert.match(text, /- practices\[p1\]\.question: duplicate option/);
  assert.match(text, /- bosses\[b\]\.steps\[1\]: same answer/);
  assert.doesNotMatch(text, /not generated yet/);
  assert.match(text, /remove/);
});

test("buildFixRequest omits the warnings heading when only errors exist", () => {
  const text = buildFixRequest(rec({ errors: ["x: duplicate option"], warnings: [] }));
  assert.doesNotMatch(text, /提醒：/);
});
