// Tests for the command-line validator: exit codes and report contents.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../tools/validate.mjs", import.meta.url));
const fixture = fileURLToPath(new URL("./fixtures/valid-world.json", import.meta.url));
const run = (...files) => spawnSync(process.execPath, [cli, ...files], { encoding: "utf8" });

// Write a modified copy of the fixture to a temp file and return its path
function tempWorld(mutate) {
  const w = JSON.parse(readFileSync(fixture, "utf8"));
  mutate(w);
  const file = join(mkdtempSync(join(tmpdir(), "eq-")), "world.json");
  writeFileSync(file, JSON.stringify(w));
  return file;
}

test("valid world exits 0 and says OK", () => {
  const r = run(fixture);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /OK/);
});

test("schema error exits 1 and names the schema step", () => {
  const r = run(tempWorld((w) => { w.framework = "expert-quest/0.2"; }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /schema/i);
});

test("check error exits 1 and prints the message", () => {
  const r = run(tempWorld((w) => { w.practices[1].question.a = 9; }));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /answer index 9/);
});

test("unreadable file exits 1", () => {
  const r = run(join(tmpdir(), "does-not-exist-eq.json"));
  assert.equal(r.status, 1);
});

test("no arguments prints usage and exits 2", () => {
  const r = run();
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage/i);
});

// Write parts to temp files and return their paths, in order
async function tempParts(mutate = () => {}) {
  const { splitWorld } = await import("./helpers/split-world.mjs");
  const w = JSON.parse(readFileSync(fixture, "utf8"));
  const parts = splitWorld(w);
  mutate(parts);
  const dir = mkdtempSync(join(tmpdir(), "eq-parts-"));
  return parts.map((p, i) => {
    const file = join(dir, `${i}-${p.part}.json`);
    writeFileSync(file, "這是片段：\n```json\n" + JSON.stringify(p, null, 2) + "\n```\n");
    return file;
  });
}

test("parts are merged and validated together", async () => {
  const r = run(...(await tempParts()));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /merged \d+ part/);
  assert.match(r.stdout, /complete/);
});

test("in-progress parts pass with warnings", async () => {
  const r = run(...(await tempParts((parts) => parts.pop())));
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /in progress/);
  assert.match(r.stdout, /warning/);
});

test("an error inside a part fails the merged world", async () => {
  const r = run(...(await tempParts((parts) => { parts[1].practices[1].question.a = 9; })));
  assert.equal(r.status, 1);
  assert.match(r.stdout, /answer index 9/);
});

test("a head part alone (no skills yet) is a valid in-progress world", async () => {
  const [head] = await tempParts();
  const r = run(head);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /in progress/);
});
