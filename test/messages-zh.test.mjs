// Tests for the Chinese rendering of check-world issues and import errors (design spec 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeIssue, describeImportError } from "../engine/messages-zh.js";

const CJK = /[一-鿿]/;

// One sample per message template in engine/check-world.js (keep in sync when adding checks)
const ISSUES = [
  "skills[a]: duplicate skill id",
  "clusters[c1]: unknown skill math/x",
  "clusters[c1]: unknown boss b1",
  "skills: world needs at least one skill",
  "clusters[c1]: has no boss",
  "schools[s]: has no final boss",
  "skills[a].def: placeholder {{...}} used outside a question",
  "skills[a]: unknown school math/x (primary school must be in this world)",
  "clusters[c1]: unknown school math/x",
  "skills[a]: unknown cluster c9",
  "skills[a]: tier 1 is lower than its cluster tier 2",
  "skills[a]: Lv3 has 1 practices (needs 2); lower maxLevel or add practices",
  "skills: prerequisite cycle: a -> b -> a",
  "placement[p1]: school math/x has no tier 3",
  "bosses[b1].steps[2]: same answer as the previous step (12 V)",
  "skills[a]: core skill needs at least 2 practices (has 1)",
  "skills[a]: core skill practices must use different contexts",
  "skills[a]: core skill needs at least 1 practice marked encounter",
  "placement: school math/x tier 1 has 2 questions (need at least 4)",
  "practices[p1]: document content must use source.license (CC-BY-4.0), found CC0-1.0",
  "practices[p1]: supplement content must use license.default (CC0-1.0), found CC-BY-4.0",
  "practices[p1].question: placeholder {{V}} has no matching variable",
  "practices[p1].question: answer index 4 is outside 4 options",
  "practices[p1].question: duplicate option",
  "practices[p1].question: why has 3 entries for 4 options",
  "practices[p1].question.mistakes[0]: value 5e-16 is more than 10^7 times away from the answer",
  "practices[p1].question.mistakes[0]: value 0.99 is the same as the answer",
  "practices[p1].question.mistakes[1]: duplicate mistake value 12",
  "practices[p1].question: shown must be a permutation of 0..3",
  "practices[p1].question.output: unknown variable: k",
  "practices[p1].question.pass: pass must be a comparison (< > <= >=)",
  "practices[p1].question.pass: never passes anywhere in the slider range",
  "practices[p1].question.fig.series[0]: not a finite number anywhere in the x range",
  "practices[p1].question.fig.series[0]: not finite at some of 50 samples",
  'practices[p1].question.answer: unknown variable: R (in "V/R")',
  'practices[p1].question.output: result is not a finite number: 1/x at {"x":0}',
  "check: check failed: boom",
];

test("every check-world message template has a Chinese rendering", () => {
  for (const issue of ISSUES) {
    const { text } = describeIssue(issue);
    assert.ok(CJK.test(text), `no translation for: ${issue}`);
  }
});

test("describeIssue splits the path and keeps ids and numbers", () => {
  const r = describeIssue("skills[math/mean]: Lv3 has 1 practices (needs 2); lower maxLevel or add practices");
  assert.equal(r.path, "skills[math/mean]");
  assert.match(r.text, /Lv3/);
  assert.match(r.text, /1/);
  assert.match(r.text, /2/);
});

test("describeIssue marks in-progress gaps", () => {
  const r = describeIssue("clusters[c1]: unknown skill math/x (not generated yet?)");
  assert.equal(r.pending, true);
  assert.match(r.text, /math\/x/);
  assert.match(r.text, /尚未生成/);
});

test("describeIssue returns unknown messages unchanged", () => {
  assert.deepEqual(describeIssue("x: something new"), { path: "x", text: "something new", pending: false });
  assert.deepEqual(describeIssue("no colon here"), { path: "", text: "no colon here", pending: false });
});

const IMPORT_ERRORS = [
  "code block 2 is not valid JSON: Unexpected token a",
  "input is not valid JSON: Unexpected token a",
  "item 1 is not a JSON object",
  "part 1 has no world id",
  "item 1 is neither a world nor a world part (kind: none)",
  "nothing to merge",
  "part ch2 belongs to world b, expected a",
  "part fix-1 removes from unknown list foo",
  "one paste contains parts of several worlds: a, b",
  "world has no id",
  "skills is not a list",
  "practices[3]: has no question",
];

test("every import error has a Chinese rendering", () => {
  for (const m of IMPORT_ERRORS) assert.ok(CJK.test(describeImportError(m)), `no translation for: ${m}`);
});

test("describeImportError translates each part of a joined message", () => {
  const text = describeImportError("world has no id；skills[0]: has no id");
  assert.equal(text.split("；").length, 2);
  for (const piece of text.split("；")) assert.ok(CJK.test(piece));
});
