// Tests for checks the JSON Schema cannot express (references, counts, expressions, licenses).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkWorld, assertShape } from "../engine/check-world.js";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const world = () => structuredClone(base);

// Helper: index of a practice by id, so mutations read clearly
const P = (w, id) => w.practices.find((p) => p.id === id);
const S = (w, id) => w.skills.find((s) => s.id === id);

// Assert that a mutated world yields at least one error containing `fragment`
function expectError(mutate, fragment) {
  const w = world();
  mutate(w);
  const { errors } = checkWorld(w);
  assert.ok(errors.some((e) => e.includes(fragment)),
    `expected an error containing ${JSON.stringify(fragment)}, got:\n${errors.join("\n") || "(none)"}`);
}

test("the valid fixture has no errors or warnings", () => {
  const { errors, warnings } = checkWorld(world());
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

// --- uniqueness and references ---

test("duplicate skill ids", () => expectError((w) => { w.skills.push(structuredClone(w.skills[0])); }, "duplicate skill id"));
test("duplicate practice ids", () => expectError((w) => { P(w, "p2").id = "p1"; }, "duplicate practice id"));
test("unknown prerequisite not listed in missingPrereqs", () =>
  expectError((w) => { S(w, "physics/acceleration").pre.push("math/integral"); }, "unknown skill math/integral"));
test("unknown link target", () =>
  expectError((w) => { S(w, "physics/acceleration").links.push({ skill: "math/limit", unlocks: 2 }); }, "unknown skill math/limit"));
test("prerequisite cycle", () =>
  expectError((w) => { S(w, "physics/velocity").pre.push("physics/acceleration"); }, "prerequisite cycle"));
test("primary school not in this world", () =>
  expectError((w) => { S(w, "physics/velocity").schools = ["physics/optics"]; }, "unknown school physics/optics"));
test("skill points to unknown cluster", () =>
  expectError((w) => { S(w, "physics/velocity").cluster = "ch9"; }, "unknown cluster ch9"));
test("cluster lists unknown skill", () =>
  expectError((w) => { w.clusters[0].skills.push("physics/jerk"); }, "unknown skill physics/jerk"));
test("practice targets unknown skill", () =>
  expectError((w) => { P(w, "p2").skill = "physics/jerk"; }, "unknown skill physics/jerk"));
test("cluster boss missing", () =>
  expectError((w) => { w.bosses = w.bosses.filter((b) => b.id !== "boss-ch1"); }, "unknown boss boss-ch1"));
test("cluster without boss", () => expectError((w) => { delete w.clusters[0].boss; }, "has no boss"));
test("tier without boss", () => expectError((w) => { delete w.schools[0].tiers[0].boss; }, "has no boss"));
test("school without final boss", () => expectError((w) => { delete w.schools[0].finalBoss; }, "has no final boss"));
test("achievement refers to unknown boss", () =>
  expectError((w) => { w.achievements[1].when.boss = "boss-x"; }, "unknown boss boss-x"));
test("glossary refers to unknown skill", () =>
  expectError((w) => { w.glossary[0].skill = "physics/jerk"; }, "unknown skill physics/jerk"));

// --- question structure ---

test("mc answer index out of range", () => expectError((w) => { P(w, "p2").question.a = 2; }, "answer index"));
test("mc duplicate options", () => expectError((w) => { P(w, "p2").question.opts = ["粒線體", "粒線體"]; }, "duplicate option"));
test("mc why length differs from options", () => expectError((w) => { P(w, "p2").question.why = [null]; }, "why"));
test("order shown is not a permutation", () => expectError((w) => { P(w, "p3").question.shown = [0, 0, 1]; }, "permutation"));
test("boss steps are checked", () => expectError((w) => { w.bosses[0].steps[0].a = 5; }, "answer index"));

// --- coverage counts ---

test("core skill with fewer than 2 practices", () =>
  expectError((w) => { w.practices = w.practices.filter((p) => p.id === "p1"); }, "at least 2 practices"));
test("core skill whose practices share one context", () =>
  expectError((w) => { for (const p of w.practices) { p.context = "subject"; p.scene = "同一場景"; } }, "different contexts"));
test("core skill without an encounter practice", () =>
  expectError((w) => { for (const p of w.practices) delete p.encounter; }, "encounter"));
test("tier with fewer than 4 placement questions", () =>
  expectError((w) => { w.placement.pop(); }, "placement"));
test("placement tier not defined by the school", () =>
  expectError((w) => { w.placement[0].tier = 2; }, "tier 2"));

// --- licenses ---

test("document content must follow source.license", () =>
  expectError((w) => { P(w, "p1").license = "CC-BY-4.0"; }, "source.license"));
test("supplement content must use license.default", () =>
  expectError((w) => { P(w, "p2").license = "CC-BY-4.0"; }, "license.default"));
test("text override is checked too", () =>
  expectError((w) => { S(w, "physics/acceleration").analog.license = "CC-BY-4.0"; }, "license.default"));

// --- expressions ---

test("numeric answer uses an undefined variable", () =>
  expectError((w) => { P(w, "p1").question.answer = "a * k"; }, "unknown variable: k"));
test("numeric answer is not finite", () =>
  expectError((w) => { P(w, "p1").question.answer = "a / (v0 - 2)"; }, "not a finite number"));
test("numeric answer has a syntax error", () =>
  expectError((w) => { P(w, "p1").question.answer = "a +"; }, "answer"));
test("mistake equals the answer after rounding", () =>
  expectError((w) => { P(w, "p1").question.mistakes.push({ expr: "a * 1.001", why: "x" }); }, "same as the answer"));
test("two mistakes are equal after rounding", () =>
  expectError((w) => { P(w, "p1").question.mistakes.push({ expr: "v0 + 6 * a", why: "x" }); }, "duplicate mistake"));
test("mistake inside the grading tolerance", () =>
  expectError((w) => { P(w, "p1").question.sig = 4; P(w, "p1").question.mistakes.push({ expr: "a * 1.0004", why: "x" }); }, "within the grading tolerance"));
test("mistake close to the answer only warns", () => {
  const w = world();
  P(w, "p1").question.sig = 3; P(w, "p1").question.mistakes.push({ expr: "a * 1.02", why: "x" });
  const { errors, warnings } = checkWorld(w);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((m) => m.includes("only 2.0% from the answer")), warnings.join("\n"));
});
test("sim with a narrow pass window on a fine grid is found", () => {
  const w = world();
  Object.assign(P(w, "p4").question, { sliders: [{ var: "th", min: 40, max: 50, step: 0.01 }], pass: "abs(th - 45.37) < 0.006" });
  assert.deepEqual(checkWorld(w).errors, []);
});
test("concept-based content must use license.default", () =>
  expectError((w) => { Object.assign(P(w, "p1"), { origin: "concept-based", attribution: { loc: "§1.2" } }); }, "concept-based content must use license.default"));
test("concept-based content under license.default passes", () => {
  const w = world();
  Object.assign(P(w, "p1"), { origin: "concept-based", license: "CC0-1.0", attribution: { loc: "§1.2" } });
  assert.deepEqual(checkWorld(w).errors, []);
});
test("placeholder refers to an undefined variable", () =>
  expectError((w) => { P(w, "p1").question.q += " {{zz}}"; }, "placeholder {{zz}}"));
test("placeholder in a question without variables", () =>
  expectError((w) => { P(w, "p2").question.q += " {{v}}"; }, "placeholder {{v}}"));
test("placeholders inside method then are checked in their own scope", () =>
  expectError((w) => { P(w, "p5").question.then.q += " {{v0}}"; }, "placeholder {{v0}}"));
test("method then is checked", () =>
  expectError((w) => { P(w, "p5").question.then.answer = "sqrt(2 * g * hh)"; }, "unknown variable: hh"));
test("sim output not finite somewhere in the slider range", () =>
  expectError((w) => { P(w, "p4").question.output.expr = "1 / (th - 45)"; }, "not a finite number"));
test("sim pass can never be satisfied", () =>
  expectError((w) => { P(w, "p4").question.pass = "th > 90"; }, "never passes"));
test("sim pass must be a comparison", () =>
  expectError((w) => { P(w, "p4").question.pass = "th - 45"; }, "comparison"));
test("plot series uses an undefined variable", () =>
  expectError((w) => { P(w, "p1").question.fig.series[0].expr = "v0 + b * t"; }, "unknown variable: b"));
test("plot point uses an undefined variable", () =>
  expectError((w) => { P(w, "p1").question.fig.series[1].points[0][1] = "w0"; }, "unknown variable: w0"));
test("diagram coordinate uses an undefined variable", () =>
  expectError((w) => { P(w, "p4").question.fig.points[0].at[0] = "q"; }, "unknown variable: q"));
test("table expression cell is evaluated", () =>
  expectError((w) => { P(w, "p5").question.fig.rows[1][1] = { expr: "1 / 0" }; }, "not a finite number"));

test("plot with a few non-finite samples only warns", () => {
  const w = world();
  P(w, "p1").question.fig.series[0].expr = "1 / t";
  const { errors, warnings } = checkWorld(w);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((m) => m.includes("not finite at some")), warnings.join("\n"));
});

// --- in-progress worlds (framework 8.7) ---

test("partial: references to items not generated yet are warnings", () => {
  const w = world();
  S(w, "physics/acceleration").pre.push("physics/jerk");
  w.clusters[0].skills.push("physics/jerk");
  const { errors, warnings } = checkWorld(w, { partial: true });
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((m) => m.includes("physics/jerk")), warnings.join("\n"));
});

test("partial: missing bosses and coverage counts are warnings", () => {
  const w = world();
  w.bosses = w.bosses.filter((b) => b.id === "boss-ch1");
  w.placement.pop();
  delete w.schools[0].finalBoss;
  const { errors, warnings } = checkWorld(w, { partial: true });
  assert.deepEqual(errors, []);
  for (const frag of ["boss-t1", "final boss", "placement"]) {
    assert.ok(warnings.some((m) => m.includes(frag)), `missing warning for ${frag}:\n${warnings.join("\n")}`);
  }
});

test("partial: expression, structure and license problems are still errors", () => {
  for (const mutate of [
    (w) => { P(w, "p1").question.answer = "a * k"; },
    (w) => { P(w, "p2").question.a = 9; },
    (w) => { P(w, "p1").license = "CC-BY-4.0"; },
    (w) => { S(w, "physics/velocity").pre.push("physics/acceleration"); },
  ]) {
    const w = world();
    mutate(w);
    assert.ok(checkWorld(w, { partial: true }).errors.length > 0);
  }
});

// --- tiers (framework 3.2) ---

test("skill tier lower than its cluster tier", () =>
  expectError((w) => { w.clusters[0].tier = 2; w.schools[0].tiers.push({ tier: 2, name: "中階", boss: "boss-t1" }); }, "lower than its cluster"));

test("skill tier higher than its cluster tier is allowed", () => {
  const w = world();
  w.schools[0].tiers.push({ tier: 2, name: "中階", boss: "boss-t1" });
  w.placement.push(...w.placement.map((p) => ({ ...structuredClone(p), id: p.id + "-t2", tier: 2 })));
  S(w, "physics/acceleration").tier = 2;
  assert.ok(!checkWorld(w).errors.some((e) => e.includes("cluster")), checkWorld(w).errors.join("\n"));
});

test("a complete world needs at least one skill", () => {
  const w = world();
  w.skills = [];
  assert.ok(checkWorld(w).errors.some((e) => e.includes("at least one skill")));
  assert.ok(!checkWorld(w, { partial: true }).errors.some((e) => e.includes("at least one skill")));
});

// --- minimal shape check used by the browser before checkWorld (design spec 5) ---

test("assertShape: the fixture passes", () => {
  assert.deepEqual(assertShape(world()), []);
});

test("assertShape: reports lists that are not lists and items without ids", () => {
  const problems = assertShape({ id: "x", skills: "nope", practices: [{ skill: "a" }] });
  assert.ok(problems.some((p) => p.includes("skills is not a list")), problems.join("\n"));
  assert.ok(problems.some((p) => p.includes("practices[0]: has no id")), problems.join("\n"));
});

test("assertShape: practices need a question and clusters need a skills list", () => {
  const problems = assertShape({ id: "x", clusters: [{ id: "c" }], practices: [{ id: "p" }] });
  assert.ok(problems.some((p) => p.includes("clusters[0]: has no skills list")));
  assert.ok(problems.some((p) => p.includes("practices[0]: has no question")));
});

test("assertShape: rejects non-objects", () => {
  assert.ok(assertShape(null).length > 0);
  assert.ok(assertShape([]).length > 0);
});

// --- decision C: every level up to maxLevel needs enough practices ---

test("a level below maxLevel without two practices is an error", () =>
  expectError((w) => { S(w, "physics/acceleration").maxLevel = 4; }, "Lv4 has 0 practices"));

test("partial: missing level practices are only a warning", () => {
  const w = world();
  S(w, "physics/acceleration").maxLevel = 4;
  const { errors, warnings } = checkWorld(w, { partial: true });
  assert.ok(!errors.some((e) => e.includes("Lv4")));
  assert.ok(warnings.some((m) => m.includes("Lv4 has 0 practices")));
});

// --- decision E: placeholders only belong in questions ---

test("placeholder in a boss intro is an error", () =>
  expectError((w) => { w.bosses[0].intro = "電壓 {{V}} V"; }, "outside a question"));
test("placeholder in a skill definition is an error", () =>
  expectError((w) => { S(w, "physics/velocity").def = "速度 {{v}}"; }, "outside a question"));
test("placeholder in a practice scene is an error", () =>
  expectError((w) => { P(w, "p2").scene = "場景 {{x}}"; }, "outside a question"));

// --- decision D: plausibility reminders ---

test("a mistake far from the answer gives a warning", () => {
  const w = world();
  P(w, "p1").question.mistakes.push({ expr: "a * 1e8", why: "x" });
  const { errors, warnings } = checkWorld(w);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((m) => m.includes("10^7")), warnings.join("\n"));
});

test("adjacent boss steps with the same answer give a warning", () => {
  const w = world();
  const step = { type: "numeric", q: "x", vars: { x: 3 }, answer: "2 * x" };
  w.bosses.find((b) => b.id === "boss-t1").steps.push(structuredClone(step));
  const { errors, warnings } = checkWorld(w);
  assert.deepEqual(errors, []);
  assert.ok(warnings.some((m) => m.includes("same answer as the previous step")), warnings.join("\n"));
});

test("adjacent boss steps with equal numbers but different units do not warn", () => {
  const w = world();
  const steps = w.bosses.find((b) => b.id === "boss-t1").steps;
  steps[0].unit = "Ω";
  steps.push({ type: "numeric", q: "y", vars: { x: 3 }, answer: "2 * x", unit: "A" });
  assert.ok(!checkWorld(w).warnings.some((m) => m.includes("same answer as the previous step")));
});
