// Tests for importing pasted AI replies and merging world parts (framework 8.7).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseImport, mergeParts, ImportError } from "../engine/merge.js";
import { splitWorld } from "./helpers/split-world.mjs";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const world = () => structuredClone(base);
const V = "expert-quest/1.0";
const part = (name, fields = {}) => ({ framework: V, kind: "part", world: "test-world", part: name, ...fields });

// ---- parseImport ----

test("parseImport reads plain JSON", () => {
  assert.deepEqual(parseImport('{"a": 1}'), [{ a: 1 }]);
});

test("parseImport extracts every fenced code block from a pasted reply", () => {
  const reply = "這是 ch2 片段：\n```json\n{\"a\": 1}\n```\n下一步請匯入。\n```\n{\"b\": 2}\n```\n";
  assert.deepEqual(parseImport(reply), [{ a: 1 }, { b: 2 }]);
});

test("parseImport tolerates a byte-order mark and CRLF line endings", () => {
  assert.deepEqual(parseImport('﻿```json\r\n{"a": 1}\r\n```\r\n'), [{ a: 1 }]);
});

test("parseImport reports invalid JSON with ImportError", () => {
  assert.throws(() => parseImport("```json\n{a: 1}\n```"), ImportError);
  assert.throws(() => parseImport("沒有任何 JSON"), ImportError);
});

// ---- mergeParts ----

test("splitting the fixture into parts and merging them gives the fixture back", () => {
  const { world: merged, complete } = mergeParts(splitWorld(world()));
  assert.equal(complete, true);
  assert.deepEqual(merged, world());
});

test("a full world.json counts as one complete part", () => {
  const { world: merged, complete } = mergeParts([world()]);
  assert.equal(complete, true);
  assert.deepEqual(merged, world());
});

test("parts without complete: true give an in-progress world", () => {
  const parts = splitWorld(world());
  delete parts[parts.length - 1].complete;
  assert.equal(mergeParts(parts).complete, false);
});

test("a later item with the same id replaces the earlier one", () => {
  const w = world();
  const fixed = structuredClone(w.practices[0]);
  fixed.scene = "修正後的場景";
  const { world: merged } = mergeParts([w, part("fix-1", { practices: [fixed] })]);
  assert.equal(merged.practices.length, w.practices.length);
  assert.equal(merged.practices[0].scene, "修正後的場景");
});

test("new items are appended in order", () => {
  const extra = { ...structuredClone(base.practices[1]), id: "p9" };
  const { world: merged } = mergeParts([world(), part("ch9", { practices: [extra] })]);
  assert.equal(merged.practices.at(-1).id, "p9");
});

test("glossary merges by term and bridges by a + b", () => {
  const g = { ...structuredClone(base.glossary[0]), def: "新解釋" };
  const b = { a: "physics/velocity", b: "biology/x", meta: "流與阻", steps: [{ type: "mc", q: "?", opts: ["a", "b"], a: 0 }],
              origin: "supplement", license: "CC0-1.0", attribution: { name: "AI 補充" } };
  const b2 = { ...structuredClone(b), meta: "守恆" };
  const { world: merged } = mergeParts([world(), part("x", { glossary: [g], bridges: [b] }), part("y", { bridges: [b2] })]);
  assert.equal(merged.glossary.length, 1);
  assert.equal(merged.glossary[0].def, "新解釋");
  assert.equal(merged.bridges.length, 1);
  assert.equal(merged.bridges[0].meta, "守恆");
});

test("remove deletes items by key", () => {
  const { world: merged } = mergeParts([world(), part("fix-1", { remove: { practices: ["p3"], glossary: ["速度"] } })]);
  assert.ok(!merged.practices.some((p) => p.id === "p3"));
  assert.equal(merged.glossary.length, 0);
});

test("scalar fields are replaced and report is merged field by field", () => {
  const { world: merged } = mergeParts([
    world(),
    part("fix-1", { title: "新名稱", report: { gaps: ["缺口一"] } }),
  ]);
  assert.equal(merged.title, "新名稱");
  assert.deepEqual(merged.report.gaps, ["缺口一"]);
  assert.deepEqual(merged.report.missingPrereqs, base.report.missingPrereqs);
});

test("sources merge by url", () => {
  const s = { name: "OpenStax", url: "https://openstax.org/", license: "CC-BY-4.0" };
  const { world: merged } = mergeParts([world(), part("expand-a", { sources: [s] }), part("expand-b", { sources: [s] })]);
  assert.deepEqual(merged.sources, [s]);
});

test("parts for different worlds are rejected", () => {
  assert.throws(() => mergeParts([world(), { ...part("x"), world: "other-world" }]), ImportError);
});

test("objects that are neither a world nor a part are rejected", () => {
  assert.throws(() => mergeParts([{ framework: V, kind: "skill-index", skills: [] }]), ImportError);
  assert.throws(() => mergeParts([{ hello: 1 }]), ImportError);
});

test("a part with an unknown list in remove is rejected", () => {
  assert.throws(() => mergeParts([world(), part("fix", { remove: { nonsense: ["a"] } })]), ImportError);
});

test("mergeParts does not mutate its input", () => {
  const parts = splitWorld(world());
  const snapshot = structuredClone(parts);
  mergeParts(parts);
  assert.deepEqual(parts, snapshot);
});
