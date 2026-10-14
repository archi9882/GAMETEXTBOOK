// Tests for app/review.js: review order, engine-computed answers, flags across imports, readiness.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reviewItems, answerSummary, touchReview, openFlags, reviewStatus } from "../app/review.js";
import { applyImport } from "../app/workbench.js";
import { buildFixRequest } from "../app/fix-request.js";

const world = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const P = (id) => world.practices.find((p) => p.id === id);

test("review items list each skill followed by its practices, then placement and boss steps", () => {
  const items = reviewItems(world);
  const keys = items.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length, "keys are unique");
  const withPractice = keys.indexOf(`skills[${P("p1").skill}]`);
  assert.ok(keys[withPractice + 1].startsWith("practices["), "a practice follows its skill");
  assert.equal(items.filter((i) => i.kind === "practice").length, world.practices.length);
  assert.equal(items.filter((i) => i.kind === "skill").length, world.skills.length);
  assert.ok(keys.some((k) => /^bosses\[.+\]\.steps\[0\]$/.test(k)));
  assert.ok(keys.some((k) => k.startsWith("placement[")));
});

test("numeric answers are computed by the engine with each mistake and its reason", () => {
  const s = answerSummary(P("p1").question);
  assert.equal(s.answer, "1.5 m/s^2");
  assert.ok(s.wrong.length >= 1 && s.wrong.every((w) => w.why));
  assert.match(s.note, /容錯/);
});

test("mc, order, sim and method questions are summarised", () => {
  assert.equal(answerSummary({ type: "mc", q: "x", opts: ["a", "b"], a: 1, why: ["no", null] }).answer, "b");
  assert.match(answerSummary({ type: "order", q: "x", items: ["a", "b"] }).answer, /1\. a/);
  const sim = answerSummary(P("p4").question);
  assert.match(sim.note, /時過關/);
  const method = answerSummary(P("p5").question);
  assert.match(method.answer, /^方法：/);
  assert.match(answerSummary({ type: "numeric", q: "x", vars: {}, answer: "k" }).error, /unknown variable/);
});

test("flags on replaced items become updated; seen marks on them are cleared", () => {
  const review = { flags: { "practices[p1]": { note: "單位錯" }, "practices[p2]": { note: "x" }, "bosses[b1].steps[1]": { note: "y" } }, seen: { "practices[p1]": true, "skills[a]": true } };
  const next = touchReview(review, [{ kind: "part", practices: [{ id: "p1" }], bosses: [{ id: "b1" }] }]);
  assert.equal(next.flags["practices[p1]"].updated, true);
  assert.equal(next.flags["practices[p2]"].updated, undefined);
  assert.equal(next.flags["bosses[b1].steps[1]"].updated, true);
  assert.deepEqual(next.seen, { "skills[a]": true });
  assert.deepEqual(openFlags(next), [{ key: "practices[p2]", note: "x" }]);
});

test("open flags go into the fix request and survive imports", () => {
  let rec = applyImport(undefined, [structuredClone(world)], "t1");
  assert.equal(buildFixRequest(rec), null);
  rec = { ...rec, review: { flags: { "practices[p2]": { note: "干擾選項太明顯" } }, seen: {} } };
  const text = buildFixRequest(rec);
  assert.match(text, /practices\[p2\]: 干擾選項太明顯/);
  const fix = { framework: "expert-quest/1.1", kind: "part", world: world.id, part: "fix-1", practices: [structuredClone(P("p2"))] };
  const after = applyImport(rec, [fix], "t2");
  assert.equal(after.review.flags["practices[p2]"].updated, true);
  assert.equal(buildFixRequest(after), null);
});

test("a world is ready when every item is seen, nothing is flagged and nothing is exploratory", () => {
  const rec = applyImport(undefined, [structuredClone(world)], "t1");
  const all = Object.fromEntries(reviewItems(rec.world).map((i) => [i.key, true]));
  assert.equal(reviewStatus(rec).ready, false);
  assert.equal(reviewStatus({ ...rec, review: { seen: all, flags: {} } }).ready, true);
  assert.equal(reviewStatus({ ...rec, review: { seen: all, flags: { "skills[x]": { note: "" } } } }).ready, false);
});
