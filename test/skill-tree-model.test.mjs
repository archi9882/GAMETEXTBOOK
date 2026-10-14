// Tests for engine/skill-tree-model.js: the semicircle layout (engine C1 design 2.1, 8).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSkillTree, GAP } from "../engine/skill-tree-model.js";

const demo = JSON.parse(readFileSync(new URL("../examples/openstax-kinematics/world.json", import.meta.url), "utf8"));
const fixture = JSON.parse(readFileSync(new URL("./fixtures/valid-world.json", import.meta.url), "utf8"));

// n chapters of `per` skills with branching prerequisites, tiers rising every seventh chapter
function book(n, per = 11) {
  const w = structuredClone(fixture);
  w.skills = []; w.clusters = [];
  for (let c = 1; c <= n; c++) {
    const tier = c <= 7 ? 1 : c <= 14 ? 2 : 3;
    const ids = [];
    for (let k = 1; k <= per; k++) {
      const id = `physics/c${c}s${k}`;
      const pre = k === 1 ? (c > 1 ? [`physics/c${c - 1}s${per}`] : []) : [ids[Math.max(0, k - 2 - (k % 3))]];
      w.skills.push({ ...structuredClone(fixture.skills[0]), id, pre, cluster: `ch${c}`, tier, ktype: ["concept"] });
      ids.push(id);
    }
    w.clusters.push({ id: `ch${c}`, school: w.schools[0].id, tier, name: `第 ${c} 章`, skills: ids });
  }
  return w;
}

test("every skill gets a position and the same world gives the same layout", () => {
  for (const w of [demo, book(20)]) {
    const t = buildSkillTree(w);
    assert.equal(t.nodes.length, w.skills.length);
    // The widest fan dips a few degrees below the horizontal at its two ends, never further
    assert.ok(t.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y) && n.y < n.r * 0.07), "no node far below the root");
    assert.equal(JSON.stringify(buildSkillTree(w)), JSON.stringify(t));
  }
});

test("neighbours on a ring keep at least the minimum gap", () => {
  const t = buildSkillTree(book(20));
  const byRing = new Map();
  for (const n of t.nodes) { const k = n.r.toFixed(3); if (!byRing.has(k)) byRing.set(k, []); byRing.get(k).push(n); }
  for (const ring of byRing.values()) {
    ring.sort((a, b) => b.theta - a.theta);
    for (let i = 1; i < ring.length; i++) {
      const d = Math.hypot(ring[i].x - ring[i - 1].x, ring[i].y - ring[i - 1].y);
      assert.ok(d >= GAP - 0.5, `nodes ${ring[i - 1].id} and ${ring[i].id} are ${d.toFixed(1)} apart`);
    }
  }
});

test("each chapter stays in its own sector and tiers come in order", () => {
  const t = buildSkillTree(book(20));
  const sectorOf = new Map(t.sectors.flatMap((s) => s.chapters.map((c) => [c.id, c])));
  for (const n of t.nodes) {
    const c = sectorOf.get(n.cluster);
    assert.ok(n.theta <= c.a0 + 1e-9 && n.theta >= c.a1 - 1e-9, `${n.id} outside its sector`);
  }
  assert.deepEqual(t.sectors.map((s) => s.tier), [1, 2, 3]);
  for (let i = 1; i < t.sectors.length; i++) assert.ok(t.sectors[i].a0 < t.sectors[i - 1].a1, "tiers do not overlap");
});

test("ring follows depth inside the chapter; cross-chapter prerequisites are kept apart", () => {
  const t = buildSkillTree(demo);
  const n = Object.fromEntries(t.nodes.map((x) => [x.id.split("/")[1], x]));
  assert.equal(n.displacement.depth, 0);
  assert.ok(n["average-velocity"].depth > n["vectors-and-scalars"].depth);
  assert.equal(t.cross.length, 0);
  const big = buildSkillTree(book(3));
  assert.equal(big.cross.length, 2, "one link into each later chapter");
  assert.ok(big.edges.every((e) => e.d.startsWith("M ")));
});

test("a small world gets a narrow fan; prerequisite cycles do not stall the layout", () => {
  const t = buildSkillTree(demo);
  const thetas = t.nodes.map((x) => x.theta);
  assert.ok(Math.max(...thetas) - Math.min(...thetas) < Math.PI / 2, "demo fan narrower than a quarter turn");
  const w = structuredClone(fixture);
  w.skills[0].pre = [w.skills[1].id];
  w.skills[1].pre = [w.skills[0].id];
  assert.equal(buildSkillTree(w).nodes.length, w.skills.length);
  assert.deepEqual(buildSkillTree({ skills: [], clusters: [] }).nodes, []);
});
