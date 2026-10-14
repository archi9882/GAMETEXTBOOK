// Players' worlds, progress and backups live only in their browsers, so a new release must keep
// reading everything an older one wrote. These tests freeze those formats; do not edit the fixtures
// to make a failing test pass — add a migration instead (CLAUDE.md section 4, maintenance rules).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../tools/validate.mjs";
import { checkWorld } from "../engine/check-world.js";
import { applyImport, partRows } from "../app/workbench.js";
import { parseBackup, restoreRecord, mergeProgress } from "../app/backup.js";
import { buildFixRequest } from "../app/fix-request.js";

const read = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const world = read("valid-world.json");
const schema = JSON.parse(readFileSync(new URL("../schema/world.schema.json", import.meta.url), "utf8"));

test("worlds written for every framework version the schema has ever accepted still validate and import", () => {
  const validate = compileSchema();
  const versions = schema.properties.framework.enum;
  assert.ok(versions.includes("expert-quest/1.0"), "1.0 worlds must stay accepted");
  for (const v of versions) {
    const w = { ...structuredClone(world), framework: v };
    assert.ok(validate(w), `${v}: ${JSON.stringify(validate.errors)}`);
    const rec = applyImport(undefined, [w], "t");
    assert.deepEqual(rec.issues.errors, [], v);
  }
});

test("a version-1 backup file still restores worlds, review marks and progress", () => {
  const backup = parseBackup(readFileSync(new URL("./fixtures/backup-v1.json", import.meta.url), "utf8"));
  assert.equal(backup.version, 1);
  const rec = restoreRecord(backup.worlds[0]);
  assert.equal(rec.id, world.id);
  assert.deepEqual(checkWorld(rec.world).errors, []);
  assert.equal(rec.review.flags["practices[p2]"].note, "示範標記");
  assert.match(buildFixRequest(rec), /practices\[p2\]: 示範標記/);
  const merged = mergeProgress({ version: 1, skills: {} }, backup.progress);
  assert.deepEqual(merged.skills, backup.progress.skills);
});

test("stored records from before imports and review existed still load and accept new parts", () => {
  // The first app release stored { id, world, complete, parts, importedAt } only
  const old = { id: world.id, world: structuredClone(world), complete: true, parts: [structuredClone(world)], importedAt: "2026-10-11T00:00:00.000Z" };
  assert.deepEqual(partRows(old).map((r) => r.part), ["world"]);
  const fix = { framework: "expert-quest/1.3", kind: "part", world: world.id, part: "fix-1", practices: [structuredClone(world.practices[0])] };
  const next = applyImport(old, [fix], "t");
  assert.deepEqual(next.imports.map((r) => r.part), ["world", "fix-1"]);
  assert.equal(next.review, undefined);
  assert.deepEqual(next.issues.errors, []);
});
