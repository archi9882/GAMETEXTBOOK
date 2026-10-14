// Semicircle skill tree layout (engine C1 design, 2026-10-14, section 2.1).
// Pure and deterministic: positions come from the world file alone; nothing is stored.
// Coordinates have the root at (0, 0) and grow upward (negative y); angles are measured from +x, counter-clockwise.

export const STEP = 78;          // distance between rings
export const GAP = 54;           // minimum distance between neighbours on a ring
const SPAN = Math.PI * 1.04;     // widest fan, a little more than a half circle
const FAN_PER_SLOT = 0.42;       // a world with few chapters gets a narrower fan
const TIER_GAP = 0.06, CHAPTER_GAP = 0.012;
const MIN_R0 = 150;

const pt = (r, t) => [r * Math.cos(t), -r * Math.sin(t)];

/** SVG arc command from the current point on radius r at angle t0 to angle t1. */
export function arcTo(r, t0, t1) {
  const [x1, y1] = pt(r, t1);
  const large = Math.abs(t1 - t0) > Math.PI ? 1 : 0;
  const sweep = t1 < t0 ? 1 : 0;
  return `A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${large} ${sweep} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

const xy = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;

/**
 * @param {object} world  merged world (may be in progress)
 * @returns {{ nodes: object[], edges: object[], trunk: object, sectors: object[], rings: number[], bounds: object }}
 *   nodes: { id, x, y, theta, r, depth, cluster, tier }; edges: { from, to, d, joints: [x, y][] } for prerequisites
 *   inside a chapter; cross: { from, to } for prerequisites across chapters (drawn only on selection)
 */
export function buildSkillTree(world) {
  const skills = world.skills ?? [];
  const byId = new Map(skills.map((s) => [s.id, s]));
  // Chapters in world order; skills without a known chapter form a last group
  const known = new Set();
  const chapters = (world.clusters ?? []).map((c) => {
    const ids = (c.skills ?? []).filter((id) => byId.has(id) && !known.has(id));
    ids.forEach((id) => known.add(id));
    return { id: c.id, name: c.name ?? c.id, tier: c.tier ?? 1, ids };
  });
  const rest = skills.filter((s) => !known.has(s.id)).map((s) => s.id);
  if (rest.length) chapters.push({ id: "", name: "其他", tier: Math.max(1, ...chapters.map((c) => c.tier)), ids: rest });
  const used = chapters.filter((c) => c.ids.length);
  if (!used.length) return { nodes: [], edges: [], cross: [], trunk: null, sectors: [], rings: [], bounds: { minX: -200, maxX: 200, minY: -200, maxY: 60 } };

  const chapterOf = new Map();
  used.forEach((c) => c.ids.forEach((id) => chapterOf.set(id, c)));

  // Depth inside the chapter: 0 when no prerequisite is taught in the same chapter (cycles are cut)
  const depth = new Map();
  const visiting = new Set();
  const depthOf = (id) => {
    if (depth.has(id)) return depth.get(id);
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const ch = chapterOf.get(id);
    const pre = (byId.get(id).pre ?? []).filter((q) => q !== id && chapterOf.get(q) === ch);
    const d = pre.length ? 1 + Math.max(...pre.map(depthOf)) : 0;
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  for (const c of used) {
    c.levels = [];
    for (const id of c.ids) (c.levels[depthOf(id)] ??= []).push(id);
    c.levels = c.levels.map((l) => l ?? []);
    c.width = Math.max(1, ...c.levels.map((l) => l.length));
  }

  // Angular sectors: tiers in order, then chapters, each chapter in proportion to its widest ring
  const tiers = [...new Set(used.map((c) => c.tier))].sort((a, b) => a - b);
  const totalW = used.reduce((a, c) => a + c.width, 0);
  const span = Math.min(SPAN, Math.max(0.5, totalW * FAN_PER_SLOT));
  const tierGap = tiers.length > 1 ? TIER_GAP : 0;
  const chGap = used.length > 1 ? CHAPTER_GAP : 0;
  const free = span - tierGap * (tiers.length - 1) - chGap * (used.length - tiers.length);
  let a = Math.PI / 2 + span / 2;
  const sectors = [];
  for (const t of tiers) {
    const chs = used.filter((c) => c.tier === t);
    const a0 = a;
    chs.forEach((c, i) => {
      const w = (free * c.width) / totalW;
      c.a0 = a; c.a1 = a - w;
      a -= w + (i < chs.length - 1 ? chGap : 0);
    });
    sectors.push({ tier: t, a0, a1: a, chapters: chs.map((c) => ({ id: c.id, name: c.name, a0: c.a0, a1: c.a1 })) });
    a -= tierGap;
  }

  // Smallest inner radius at which every ring of every chapter keeps neighbours GAP apart
  let R0 = MIN_R0;
  for (const c of used) c.levels.forEach((lvl, d) => {
    if (lvl.length) R0 = Math.max(R0, (lvl.length * GAP) / Math.abs(c.a1 - c.a0) - d * STEP);
  });
  const R = (d) => R0 + d * STEP;

  // Place rings outward; order each ring by the mean angle of its parents to keep lines short
  const node = new Map();
  for (const c of used) {
    const w = c.a1 - c.a0;
    c.levels.forEach((lvl, d) => {
      const key = (id) => {
        const ps = (byId.get(id).pre ?? []).map((q) => node.get(q)).filter((p) => p && chapterOf.get(p.id) === c);
        return ps.length ? ps.reduce((x, p) => x + p.theta, 0) / ps.length : c.a0 + w / 2;
      };
      const order = c.ids.filter((id) => lvl.includes(id));
      const keys = new Map(order.map((id) => [id, key(id)]));
      order.sort((x, y) => keys.get(y) - keys.get(x) || c.ids.indexOf(x) - c.ids.indexOf(y));
      order.forEach((id, i) => {
        const theta = c.a0 + (w * (i + 0.5)) / order.length;
        const [x, y] = pt(R(d), theta);
        node.set(id, { id, x, y, theta, r: R(d), depth: d, cluster: c.id, tier: c.tier });
      });
    });
  }

  // Prerequisite lines inside a chapter: out from the prerequisite, along an arc, out to the skill
  const edges = [], cross = [];
  for (const s of skills) {
    const to = node.get(s.id);
    if (!to) continue;
    for (const q of s.pre ?? []) {
      const from = node.get(q);
      if (!from || q === s.id) continue;
      if (chapterOf.get(q) !== chapterOf.get(s.id)) { cross.push({ from: q, to: s.id }); continue; }
      const rm = to.r - STEP / 2;
      const [ax, ay] = pt(rm, from.theta), [bx, by] = pt(rm, to.theta);
      const bend = Math.abs(from.theta - to.theta) > 1e-6;
      const d = `M ${xy([from.x, from.y])} L ${xy([ax, ay])} ${bend ? arcTo(rm, from.theta, to.theta) : ""} L ${xy([to.x, to.y])}`;
      edges.push({ from: q, to: s.id, d, joints: bend ? [[ax, ay], [bx, by]] : [] });
    }
  }

  // Trunk: from the root up to a hub arc, then out to every first ring
  const hubR = R0 - STEP / 2;
  const firsts = [...node.values()].filter((n) => n.depth === 0);
  const tMax = Math.max(...firsts.map((n) => n.theta)), tMin = Math.min(...firsts.map((n) => n.theta));
  const trunk = {
    d: `M 0 0 L ${xy(pt(hubR, Math.PI / 2))}`,
    hub: tMax - tMin > 1e-6 ? `M ${xy(pt(hubR, tMax))} ${arcTo(hubR, tMax, tMin)}` : "",
    spokes: firsts.map((n) => ({ to: n.id, d: `M ${xy(pt(hubR, n.theta))} L ${xy([n.x, n.y])}`, joint: pt(hubR, n.theta) })),
    joint: pt(hubR, Math.PI / 2),
  };

  const maxDepth = Math.max(...[...node.values()].map((n) => n.depth));
  const rings = Array.from({ length: maxDepth + 1 }, (_, d) => R(d));
  const maxR = R(maxDepth);
  // Room for the sector labels outside the rim and the root below
  const ends = [...pt(maxR + 110, sectors[0].a0), ...pt(maxR + 110, sectors.at(-1).a1)];
  const minX = Math.min(ends[0], ends[2], -maxR * Math.sin(Math.min(span / 2, Math.PI / 2)) - 110, -120);
  const maxX = Math.max(ends[0], ends[2], maxR * Math.sin(Math.min(span / 2, Math.PI / 2)) + 110, 120);
  return {
    nodes: [...node.values()], edges, cross, trunk, sectors, rings, R0, maxR,
    bounds: { minX, maxX, minY: -maxR - 120, maxY: 70 },
  };
}
