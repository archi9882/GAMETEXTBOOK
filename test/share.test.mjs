// Tests for engine/share.js: the class version follows framework 7.4 and stays a valid world.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildShareWorld, isClassWorld, RESTRICTED } from "../engine/share.js";
import { checkWorld } from "../engine/check-world.js";
import { compileSchema } from "../tools/validate.mjs";

const validate = compileSchema();
const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const NOW = "2026-10-12T00:00:00Z";

// Every content-bearing place where restricted text could survive
function restrictedContent(w) {
  const found = [];
  const lists = ["practices", "placement", "bosses", "bridges"];
  for (const name of lists) for (const item of w[name] ?? []) if (RESTRICTED.has(item.license)) found.push(`${name}[${item.id}]`);
  for (const s of w.skills) {
    for (const f of ["analog", "analogLimit", "story"]) {
      const v = s[f];
      if (v === undefined) continue;
      const lic = v && typeof v === "object" ? v.license : s.license;
      if (RESTRICTED.has(lic)) found.push(`skills[${s.id}].${f}`);
    }
    if (RESTRICTED.has(s.license) && !/^（內容見原書/.test(s.def)) found.push(`skills[${s.id}].def`);
    if (RESTRICTED.has(s.license) && (s.figs ?? []).some((f) => f.type !== "ref")) found.push(`skills[${s.id}].figs`);
  }
  for (const g of w.glossary) if (RESTRICTED.has(g.license) && !/^（解釋見原書/.test(g.def)) found.push(`glossary[${g.term}]`);
  return found;
}

test("all-rights-reserved content is removed and pointers stay", () => {
  const { world, removed, nonCommercial } = buildShareWorld(structuredClone(base), NOW);
  assert.deepEqual(restrictedContent(world), []);
  assert.equal(removed.practices, 1);
  assert.equal(removed.bosses, 1);
  assert.equal(removed.glossary, 1);
  // Structure and addresses stay
  const s = world.skills.find((x) => x.id === "physics/acceleration");
  const orig = base.skills.find((x) => x.id === "physics/acceleration");
  assert.deepEqual([s.name, s.pre, s.pages, s.num], [orig.name, orig.pre, orig.pages, orig.num]);
  assert.match(s.def, /Test Book/);
  // Supplement and open content stay; the teacher's own background does not travel
  assert.ok(world.practices.some((p) => p.id === "p2") && world.practices.some((p) => p.id === "p3"));
  assert.equal(world.player, undefined);
  assert.equal(nonCommercial, false);
  assert.ok(isClassWorld(world));
});

test("the class version passes the schema and has no errors as an in-progress world", () => {
  const { world } = buildShareWorld(structuredClone(base), NOW);
  assert.ok(validate(world), JSON.stringify(validate.errors, null, 2));
  assert.deepEqual(checkWorld(world, { partial: true }).errors, []);
});

test("references to removed bosses are dropped, including achievements", () => {
  const { world } = buildShareWorld(structuredClone(base), NOW);
  const ids = new Set(world.bosses.map((b) => b.id));
  for (const c of world.clusters) assert.ok(c.boss === undefined || ids.has(c.boss));
  for (const a of world.achievements) assert.ok(a.when.boss === undefined || ids.has(a.when.boss));
});

test("an open-licensed or teacher-authored document keeps everything", () => {
  for (const lic of ["CC-BY-4.0", "LicenseRef-Classroom"]) {
    const w = structuredClone(base);
    const swap = (x) => { if (x.license === "LicenseRef-All-Rights-Reserved") x.license = lic; };
    w.source.license = lic;
    [w.skills, w.practices, w.placement, w.bosses, w.glossary].forEach((l) => l.forEach(swap));
    for (const s of w.skills) for (const f of ["analog", "analogLimit", "story"]) if (s[f] && typeof s[f] === "object") swap(s[f]);
    const { world, removed } = buildShareWorld(w, NOW);
    assert.equal(world.practices.length, base.practices.length, lic);
    assert.equal(removed.fields, 0, lic);
    assert.equal(world.skills[0].def, base.skills[0].def);
  }
});

test("NC content marks the class version as non-commercial and is credited", () => {
  const w = structuredClone(base);
  const p3 = w.practices.find((p) => p.id === "p3");
  p3.license = "CC-BY-NC-SA-4.0";
  const { nonCommercial, credits } = buildShareWorld(w, NOW);
  assert.equal(nonCommercial, true);
  assert.ok(credits.some((c) => c.license === "CC-BY-NC-SA-4.0" && c.url));
});

test("the class marker survives import through the workbench", async () => {
  const { applyImport, readPaste } = await import("../app/workbench.js");
  const { world } = buildShareWorld(structuredClone(base), NOW);
  const rec = applyImport(undefined, readPaste(JSON.stringify(world)).docs, NOW);
  assert.ok(isClassWorld(rec.world));
  assert.deepEqual(rec.issues.errors, []);
});

test("concept-based content from an all-rights-reserved book stays in the class version", () => {
  const w = structuredClone(base);
  Object.assign(w.practices.find((p) => p.id === "p1"), { origin: "concept-based", license: w.license.default, attribution: { loc: "§1.2" } });
  const { world, removed, credits } = buildShareWorld(w, NOW);
  assert.ok(world.practices.some((p) => p.id === "p1"));
  assert.equal(removed.practices, 0);
  assert.ok(credits.some((c) => c.name === base.source.title && c.origin === "concept-based"));
  assert.deepEqual(restrictedContent(world), []);
});
