// Tests for the region map generator (design spec 4.1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildMap, orderSkills, findPath, isWalkable, objectAt, interactTarget, distances, distanceTo,
} from "../engine/layout.js";

const base = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));
const world = () => structuredClone(base);

// Fixture plus a second, higher-tier chapter with three skills chained by prerequisites
function twoTownWorld() {
  const w = world();
  w.schools[0].tiers.push({ tier: 2, name: "中階", boss: "boss-t2" });
  const mk = (id, num, pre) => ({ ...structuredClone(w.skills[0]), id, num, pre, kind: "core", cluster: "ch2", tier: 2 });
  w.skills.push(mk("physics/s3", "2.1", ["physics/s2"]), mk("physics/s2", "2.2", ["physics/s1"]), mk("physics/s1", "2.3", []));
  w.clusters.push({ id: "ch2", school: w.schools[0].id, tier: 2, name: "第二章", skills: ["physics/s3", "physics/s2", "physics/s1"], boss: "boss-ch2" });
  w.practices.push({ ...structuredClone(w.practices[1]), id: "c1", skill: "physics/s1", context: "commission" });
  return w;
}

const snapshot = (m) => JSON.stringify({ tiles: m.tiles, objects: m.objects, towns: m.towns, spawn: m.spawn });

test("the same world always produces the same map", () => {
  assert.equal(snapshot(buildMap(world())), snapshot(buildMap(world())));
});

test("skills inside a chapter follow prerequisites before section numbers", () => {
  const w = twoTownWorld();
  assert.deepEqual(orderSkills(w, w.clusters[1]), ["physics/s1", "physics/s2", "physics/s3"]);
});

test("orderSkills skips skills that are not generated yet", () => {
  const w = world();
  w.clusters[0].skills.push("physics/not-yet");
  assert.ok(!orderSkills(w, w.clusters[0]).includes("physics/not-yet"));
});

test("every skill gets one lamp; commission practices become npcs, subject practices signs", () => {
  const w = twoTownWorld();
  const m = buildMap(w);
  const lamps = m.objects.filter((o) => o.kind === "lamp").map((o) => o.skill).sort();
  assert.deepEqual(lamps, w.skills.map((s) => s.id).sort());
  const npcs = m.objects.filter((o) => o.kind === "npc").map((o) => o.practice).sort();
  assert.deepEqual(npcs, w.practices.filter((p) => p.context === "commission").map((p) => p.id).sort());
  const signed = m.objects.filter((o) => o.kind === "sign").flatMap((o) => o.practices).sort();
  assert.deepEqual(signed, w.practices.filter((p) => p.context !== "commission").map((p) => p.id).sort());
});

test("every object can be reached from the spawn point", () => {
  for (const w of [world(), twoTownWorld()]) {
    const m = buildMap(w);
    assert.ok(isWalkable(m, m.spawn.x, m.spawn.y), "spawn must be walkable");
    for (const o of m.objects) {
      assert.notEqual(findPath(m, m.spawn, o), null, `${o.kind} at ${o.x},${o.y} is unreachable`);
    }
  }
});

test("each town has a gym and the gym is the last thing on its main street", () => {
  const m = buildMap(twoTownWorld());
  for (const t of m.towns) {
    const inTown = m.objects.filter((o) => o.x >= t.x && o.x < t.x + t.w);
    const gym = inTown.find((o) => o.kind === "gym");
    assert.ok(gym, `town ${t.cluster} has no gym`);
    for (const lamp of inTown.filter((o) => o.kind === "lamp")) assert.ok(lamp.x < gym.x);
  }
});

test("a tier increase puts a cliff with stairs on the road", () => {
  const m = buildMap(twoTownWorld());
  const flat = m.tiles.flat();
  assert.ok(flat.includes("cliff"));
  assert.ok(m.tiles[m.spawn.y].includes("stairs"), "stairs must be on the street row");
  assert.ok(!buildMap(world()).tiles.flat().includes("cliff"));
});

test("higher-tier towns use plateau ground", () => {
  const m = buildMap(twoTownWorld());
  const t = m.towns[1];
  assert.equal(m.tiles[t.y][t.x], "plateau");
  assert.equal(m.tiles[m.towns[0].y][m.towns[0].x], "meadow");
});

test("decorations never land inside towns", () => {
  const m = buildMap(twoTownWorld());
  for (const t of m.towns) {
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) {
      assert.ok(!["tree", "water"].includes(m.tiles[y][x]), `${m.tiles[y][x]} at ${x},${y}`);
    }
  }
});

test("a chapter with no generated skills still gets a town and a gym", () => {
  const w = world();
  w.clusters.push({ id: "ch9", school: w.schools[0].id, tier: 1, name: "未來的章", skills: ["physics/x"], boss: "boss-ch9" });
  const m = buildMap(w);
  assert.equal(m.towns.length, 2);
  assert.equal(m.objects.filter((o) => o.kind === "gym").length, 2);
});

test("a world without clusters still builds a walkable map", () => {
  const w = world();
  w.clusters = [];
  const m = buildMap(w);
  assert.ok(isWalkable(m, m.spawn.x, m.spawn.y));
});

test("findPath returns adjacent walkable steps", () => {
  const m = buildMap(twoTownWorld());
  const gym = m.objects.filter((o) => o.kind === "gym").at(-1);
  const steps = findPath(m, m.spawn, gym);
  let cur = m.spawn;
  for (const s of steps) {
    assert.equal(Math.abs(s.x - cur.x) + Math.abs(s.y - cur.y), 1);
    assert.ok(isWalkable(m, s.x, s.y));
    cur = s;
  }
});

test("objectAt covers multi-tile footprints and interactTarget prefers the faced tile", () => {
  const m = buildMap(world());
  const gym = m.objects.find((o) => o.kind === "gym");
  assert.equal(objectAt(m, gym.x + gym.w - 1, gym.y + gym.h - 1), gym);
  const lamp = m.objects.find((o) => o.kind === "lamp" && o.skill === "physics/acceleration");
  assert.equal(interactTarget(m, lamp.x, lamp.y + 1, "up"), lamp);
});

test("distanceTo measures the walk to the nearest side of an object", () => {
  const m = buildMap(world());
  const dist = distances(m, m.spawn);
  const lamp = m.objects.find((o) => o.kind === "lamp");
  assert.equal(distanceTo(m, dist, lamp), findPath(m, m.spawn, lamp).length);
});
