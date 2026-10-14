// Tests for the memory store; the IndexedDB store implements the same interface (design spec 4).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStore } from "../engine/store.js";

test("listWorlds returns every stored world", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a", world: { id: "a" } });
  await s.putWorld({ id: "b", world: { id: "b" } });
  assert.deepEqual((await s.listWorlds()).map((r) => r.id).sort(), ["a", "b"]);
});

test("deleteWorld removes the world and clears meta that points at it", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a" });
  await s.putWorld({ id: "b" });
  await s.putMeta({ world: "a", pos: { x: 1, y: 2 } });
  await s.deleteWorld("a");
  assert.equal(await s.getWorld("a"), undefined);
  assert.equal(await s.getMeta(), undefined);
  assert.deepEqual((await s.listWorlds()).map((r) => r.id), ["b"]);
});

test("deleteWorld keeps meta for another world", async () => {
  const s = createMemoryStore();
  await s.putWorld({ id: "a" });
  await s.putMeta({ world: "b" });
  await s.deleteWorld("a");
  assert.deepEqual(await s.getMeta(), { world: "b" });
});

test("settings are stored apart from the current position", async () => {
  const s = createMemoryStore();
  await s.putMeta({ world: "a" });
  await s.putSetting("lastBackup", "2026-10-12T00:00:00Z");
  assert.equal(await s.getSetting("lastBackup"), "2026-10-12T00:00:00Z");
  assert.deepEqual(await s.getMeta(), { world: "a" });
});
