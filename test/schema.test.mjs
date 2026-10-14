// Tests for schema/world.schema.json: the fixture passes, outdated or broken shapes fail.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../tools/validate.mjs";

const validate = compileSchema();
const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const world = () => structuredClone(base);
const P = (w, id) => w.practices.find((p) => p.id === id);

test("the valid fixture passes the schema", () => {
  assert.ok(validate(world()), JSON.stringify(validate.errors, null, 2));
});

test("framework 1.2 worlds may mark content as concept-based", () => {
  const w = world();
  w.framework = "expert-quest/1.2";
  Object.assign(P(w, "p1"), { origin: "concept-based", license: "CC0-1.0", attribution: { loc: "§1.2" } });
  assert.ok(validate(w), JSON.stringify(validate.errors, null, 2));
});

test("framework 1.1 worlds may list possible bridges in the report", () => {
  const w = world();
  w.framework = "expert-quest/1.1";
  w.report.possibleBridges = [{ skill: w.skills[0].id, meta: "rate of change", note: "calculus" }];
  assert.ok(validate(w), JSON.stringify(validate.errors, null, 2));
});

// Each mutation produces a world the schema must reject
const rejected = {
  "old three-part skill id": (w) => { w.skills[0].id = "physics/newtonian-mechanics/velocity"; },
  "unknown discipline": (w) => { w.skills[0].id = "engineering/stress"; },
  "missing license": (w) => { delete P(w, "p1").license; },
  "missing attribution": (w) => { delete w.skills[0].attribution; },
  "expansion without url": (w) => { delete P(w, "p3").attribution.url; },
  "supplement without name": (w) => { P(w, "p2").attribution = {}; },
  "old src field": (w) => { P(w, "p1").src = "Example 1.1"; },
  "old figure question type": (w) => { P(w, "p1").question.type = "figure"; },
  "encounter on a sim question": (w) => { P(w, "p4").encounter = true; },
  "placement with an order question": (w) => { w.placement[0].question = { type: "order", q: "x", items: ["a", "b"] }; },
  "numeric without answer": (w) => { delete P(w, "p1").question.answer; },
  "numeric as mc without mistakes": (w) => { delete P(w, "p1").question.mistakes; },
  "method without a best method": (w) => { P(w, "p5").question.methods[0].best = false; },
  "unknown figure type": (w) => { w.skills[1].figs[0].type = "photo"; },
  "plot series with both expr and points": (w) => { P(w, "p1").question.fig.series[0].points = [[0, 0]]; },
  "opamp without pins": (w) => { delete P(w, "p5").question.then.fig.elements[1].pins; },
  "resistor without end point": (w) => { delete P(w, "p5").question.then.fig.elements[0].to; },
  "text override without license": (w) => { delete w.skills[1].analog.license; },
  "top-level encounters list": (w) => { w.encounters = ["p1"]; },
  "older framework version": (w) => { w.framework = "expert-quest/0.9"; },
  "free-text license": (w) => { w.source.license = "all rights reserved"; },
  "tier 4": (w) => { w.skills[0].tier = 4; },
  "concept-based without loc": (w) => { Object.assign(P(w, "p1"), { origin: "concept-based", license: "CC0-1.0", attribution: { name: "x" } }); },
  "possible bridge without skill": (w) => { w.report.possibleBridges = [{ meta: "x" }]; },
  "new school without reason": (w) => { w.report.newSchools = [{ id: "physics/x" }]; },
  "Chinese confidence value": (w) => { w.skills[0].confidence = "文件原意"; },
};

for (const [name, mutate] of Object.entries(rejected)) {
  test(`schema rejects: ${name}`, () => {
    const w = world();
    mutate(w);
    assert.equal(validate(w), false);
  });
}

test("numeric without as does not need mistakes", () => {
  const w = world();
  delete P(w, "p1").question.as;
  delete P(w, "p1").question.mistakes;
  assert.ok(validate(w), JSON.stringify(validate.errors, null, 2));
});
