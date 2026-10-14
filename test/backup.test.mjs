// Tests for app/backup.js: full backup export, parsing, restore planning and progress merging.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildBackup, parseBackup, planRestore, mergeProgress, restoreRecord, backupFileName, daysSince, BackupError } from "../app/backup.js";
import { applyImport } from "../app/workbench.js";

const world = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const rec = (at) => applyImport(undefined, [structuredClone(world)], at);

test("a backup round-trips through JSON", () => {
  const b = buildBackup({ worlds: [rec("2026-10-01T00:00:00Z")], progress: { version: 1, skills: {} } }, "2026-10-12T08:00:00Z");
  const back = parseBackup(JSON.stringify(b));
  assert.equal(back.worlds[0].id, world.id);
  assert.match(back.notice, /僅限個人使用/);
  assert.equal(backupFileName("2026-10-12T08:00:00Z"), "expert-quest-backup-2026-10-12.json");
});

test("parseBackup rejects other files with a Chinese message", () => {
  assert.throws(() => parseBackup("not json"), BackupError);
  assert.throws(() => parseBackup(JSON.stringify(world)), /不是專家養成記的備份檔/);
  assert.throws(() => parseBackup(JSON.stringify({ kind: "expert-quest-backup", version: 99, worlds: [] })), /較新版本/);
  assert.throws(() => parseBackup(JSON.stringify({ kind: "expert-quest-backup", version: 1, worlds: [{}] })), /損壞/);
});

test("planRestore marks new worlds and which side of a conflict is newer", () => {
  const backup = buildBackup({ worlds: [{ ...rec("2026-10-05T00:00:00Z") }, { ...rec("2026-10-05T00:00:00Z"), id: "other" }], progress: {} }, "x");
  const plan = planRestore([rec("2026-10-01T00:00:00Z")], backup);
  assert.deepEqual(plan.map((p) => [p.id, p.action, p.newer]), [[world.id, "conflict", "backup"], ["other", "add", "backup"]]);
  const plan2 = planRestore([rec("2026-10-09T00:00:00Z")], backup);
  assert.equal(plan2[0].newer, "current");
});

test("mergeProgress keeps the higher count and experience on both sides", () => {
  const a = { version: 1, skills: { s1: { solved: { p1: 1, p2: 3 }, xp: 30 }, s2: { solved: { q: 1 }, xp: 10 } } };
  const b = { version: 1, skills: { s1: { solved: { p1: 2, p3: 1 }, xp: 25 }, s3: { solved: { r: 1 }, xp: 5 } } };
  assert.deepEqual(mergeProgress(a, b), { version: 1, skills: {
    s1: { solved: { p1: 2, p2: 3, p3: 1 }, xp: 30 }, s2: { solved: { q: 1 }, xp: 10 }, s3: { solved: { r: 1 }, xp: 5 },
  } });
});

test("restoreRecord rebuilds the world from its parts and re-runs the checks", () => {
  const r = rec("2026-10-01T00:00:00Z");
  const stale = { ...r, world: { id: r.id, skills: [] }, issues: { errors: ["old"], warnings: [] } };
  const fresh = restoreRecord(stale);
  assert.equal(fresh.world.skills.length, world.skills.length);
  assert.deepEqual(fresh.issues.errors, []);
});

test("daysSince counts whole days", () => {
  assert.equal(daysSince(null, "2026-10-12T00:00:00Z"), null);
  assert.equal(daysSince("2026-09-28T12:00:00Z", "2026-10-12T13:00:00Z"), 14);
});
