// Tests for turning pasted AI replies into stored world records (design spec 3, 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readPaste, worldIdOf, applyImport, partLabel, partRows } from "../app/workbench.js";
import { ImportError } from "../engine/merge.js";
import { splitWorld } from "./helpers/split-world.mjs";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const parts = () => splitWorld(structuredClone(base));
const fence = (obj) => "這是片段，請匯入。\n```json\n" + JSON.stringify(obj) + "\n```\n";
const T1 = "2026-10-11T01:00:00.000Z";
const T2 = "2026-10-11T02:00:00.000Z";

test("readPaste returns the documents and their world id", () => {
  const [head] = parts();
  const r = readPaste(fence(head));
  assert.equal(r.worldId, base.id);
  assert.equal(r.docs.length, 1);
});

test("readPaste rejects a paste that mixes worlds", () => {
  const [head] = parts();
  const other = { ...head, world: "other-world" };
  assert.throws(() => readPaste(fence(head) + fence(other)), (e) => e instanceof ImportError && /several worlds/.test(e.message));
});

test("worldIdOf reads parts and full worlds", () => {
  assert.equal(worldIdOf([{ kind: "part", world: "w" }]), "w");
  assert.equal(worldIdOf([{ id: "w", framework: "expert-quest/1.0" }]), "w");
  assert.equal(worldIdOf([{}]), undefined);
});

test("applyImport creates an in-progress world from a head part", () => {
  const [head] = parts();
  const rec = applyImport(undefined, [head], T1);
  assert.equal(rec.id, base.id);
  assert.equal(rec.complete, false);
  assert.deepEqual(rec.imports, [{ part: "head", at: T1 }]);
  assert.equal(rec.importedAt, T1);
  assert.ok(rec.issues.warnings.some((w) => w.endsWith("(not generated yet?)")));
  assert.deepEqual(rec.issues.errors, []);
});

test("applyImport appends later parts and completes the world", () => {
  const all = parts();
  let rec = applyImport(undefined, [all[0]], T1);
  rec = applyImport(rec, all.slice(1), T2);
  assert.equal(rec.complete, true);
  assert.equal(rec.parts.length, all.length);
  assert.deepEqual(rec.issues, { errors: [], warnings: [] });
  assert.equal(rec.imports.at(-1).at, T2);
});

test("a full world replaces every stored part", () => {
  const all = parts();
  let rec = applyImport(undefined, all.slice(0, 2), T1);
  rec = applyImport(rec, [structuredClone(base)], T2);
  assert.equal(rec.parts.length, 1);
  assert.deepEqual(rec.imports, [{ part: "world", at: T2 }]);
  assert.equal(rec.complete, true);
});

test("applyImport derives import rows for old records without imports", () => {
  const all = parts();
  const old = { id: base.id, parts: [all[0]] };
  const rec = applyImport(old, [all[1]], T2);
  assert.deepEqual(rec.imports.map((r) => r.part), ["head", all[1].part]);
  assert.equal(rec.imports[0].at, null);
});

test("applyImport rejects a world the engine cannot load", () => {
  const bad = { framework: "expert-quest/1.0", kind: "part", world: "w", part: "ch1", practices: [{ id: "p1" }] };
  assert.throws(() => applyImport(undefined, [bad], T1), (e) => e instanceof ImportError && /has no question/.test(e.message));
});

test("partLabel names parts and full worlds", () => {
  assert.equal(partLabel({ kind: "part", part: "fix-2" }), "fix-2");
  assert.equal(partLabel({ id: "w" }), "world");
});

test("partRows marks earlier copies of the same part as replaced", () => {
  const rec = { imports: [{ part: "head", at: T1 }, { part: "ch1", at: T1 }, { part: "ch1", at: T2 }] };
  assert.deepEqual(partRows(rec).map((r) => r.replaced), [false, true, false]);
});
