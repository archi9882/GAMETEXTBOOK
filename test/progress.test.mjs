// Tests for experience, skill levels and lamp states (framework 3.3, design spec 4.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyProgress, recordCorrect, totalXp, skillLevel, isExpandable, lampState, learnableSkills, xpFor, isSolved,
} from "../engine/progress.js";

// Skill a: Lv1, two Lv2, one Lv3 practice. Skill b depends on a (and on a skill from another world).
// Skill c has no practices at all.
const world = {
  skills: [
    { id: "physics/a", maxLevel: 4, pre: [] },
    { id: "physics/b", maxLevel: 2, pre: ["physics/a", "math/outside"] },
    { id: "physics/c", maxLevel: 5, pre: [] },
  ],
  practices: [
    { id: "a1", skill: "physics/a", level: 1 },
    { id: "a2", skill: "physics/a", level: 2 },
    { id: "a2b", skill: "physics/a", level: 2 },
    { id: "a3", skill: "physics/a", level: 3 },
    { id: "b1", skill: "physics/b", level: 1 },
  ],
};
const [A, B, C] = world.skills;
const P = (id) => world.practices.find((x) => x.id === id);
const solve = (start, ...ids) => ids.reduce((prog, id) => recordCorrect(prog, P(id)).progress, start);

test("xpFor doubles per level starting at 10", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(xpFor), [10, 20, 40, 80, 160]);
});

test("first correct answer gets full xp, repeats 20 %, weaker method half", () => {
  const first = recordCorrect(emptyProgress(), P("a2"));
  assert.equal(first.xp, 20);
  assert.equal(first.first, true);
  const again = recordCorrect(first.progress, P("a2"));
  assert.equal(again.xp, 4);
  assert.equal(again.first, false);
  assert.equal(recordCorrect(emptyProgress(), P("a2"), 0.5).xp, 10);
});

test("recordCorrect does not mutate its input", () => {
  const start = emptyProgress();
  recordCorrect(start, P("a1"));
  assert.deepEqual(start, emptyProgress());
});

test("totalXp sums every skill", () => {
  assert.equal(totalXp(solve(emptyProgress(), "a1", "b1")), 20);
});

test("isSolved tracks practices answered correctly", () => {
  const prog = solve(emptyProgress(), "a1");
  assert.equal(isSolved(prog, P("a1")), true);
  assert.equal(isSolved(prog, P("a2")), false);
});

test("Lv1 comes from any correct practice", () => {
  assert.equal(skillLevel(emptyProgress(), A, world), 0);
  assert.equal(skillLevel(solve(emptyProgress(), "a2"), A, world), 1);
});

test("Lv2 needs two different Lv2 practices", () => {
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2"), A, world), 1);
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2", "a2"), A, world), 1);
  assert.equal(skillLevel(solve(emptyProgress(), "a1", "a2", "a2b"), A, world), 2);
});

test("a level with too few practices stops progress and marks the skill expandable", () => {
  const prog = solve(emptyProgress(), "a1", "a2", "a2b", "a3");
  assert.equal(skillLevel(prog, A, world), 2);
  assert.equal(isExpandable(prog, A, world), true);
  assert.equal(isExpandable(solve(emptyProgress(), "a1"), A, world), false);
});

test("level never exceeds maxLevel and missing levels are expandable", () => {
  const prog = solve(emptyProgress(), "b1");
  assert.equal(skillLevel(prog, B, world), 1);
  assert.equal(isExpandable(prog, B, world), true);
});

test("a skill without practices stays at 0 and is expandable", () => {
  assert.equal(skillLevel(emptyProgress(), C, world), 0);
  assert.equal(isExpandable(emptyProgress(), C, world), true);
});

test("lamp states: lit, ready, blocked; prerequisites from other worlds are ignored", () => {
  const start = emptyProgress();
  assert.equal(lampState(start, A, world), "ready");
  assert.equal(lampState(start, B, world), "blocked");
  const prog = solve(start, "a1");
  assert.equal(lampState(prog, A, world), "lit");
  assert.equal(lampState(prog, B, world), "ready");
});

test("learnableSkills lists ready skills", () => {
  assert.deepEqual(learnableSkills(emptyProgress(), world), ["physics/a", "physics/c"]);
  assert.deepEqual(learnableSkills(solve(emptyProgress(), "a1"), world), ["physics/b", "physics/c"]);
});
