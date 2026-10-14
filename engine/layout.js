// Build the pixel-tile region map for a world (design spec 2026-10-09, section 4.1).
// Pure and deterministic: the same world always produces the same map; no DOM access.
//
// Region: towns (one per chapter) in a snake of rows, at most five per row, joined by roads with tall grass
// (engine C1 design, 2026-10-14, section 3). A tier increase puts a cliff with stairs and a gate on the road;
// the road ends at the final hall below the last town. A world with one chapter is a single town.
// Inside a town (rows relative to the town's top):
//   1-3  houses            2-5  gym at the east end
//   5    lamps (north side of the street) with a sign right after each lamp
//   6    main street       8-10 commission npcs below their lamp
//   west alley (optional skills) runs south from the street when needed

export const WALKABLE = new Set(["grass", "meadow", "plateau", "pave", "sand", "tall", "stairs", "flower", "park", "dock", "brick", "stone", "plaza"]);

// Town ground by the chapter's most common knowledge type (engine C1 design 3.2)
export const LAND = { concept: "park", principle: "dock", procedure: "brick", fact: "stone", judgment: "plaza" };

const BORDER = 3;              // forest thickness around the region
const MARGIN = 2;              // open ground between the border and the first or last town
const ROAD = 8;                // minimum road length between two towns in a row
const VGAP = 8;                // rows between two rows of towns
const MAX_COLS = 5;            // towns per row
const HALL_W = 5, HALL_H = 4;  // final hall below the last town
const TOWN_TOP = BORDER + 2;   // first row of every town
const STREET = 6;              // main street row inside a town
const MIN_TOWN_W = 16, MIN_TOWN_H = 11;
const GYM_W = 6, GYM_H = 4, HOUSE_W = 4, HOUSE_H = 3;
const MAX_NPC_MAIN = 6, MAX_NPC_ALLEY = 2;   // further commissions stay reachable from the skill page
const LOOKS = 6;                             // npc appearance variants (see tiles.js)

const key = (x, y) => `${x},${y}`;
const FACING = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };

// Seeded random numbers in [0, 1)
function rng(seedText) {
  let h = 2166136261;
  for (const ch of String(seedText)) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

function hashLook(text) {
  let h = 0;
  for (const ch of String(text)) h = (h * 31 + ch.codePointAt(0)) | 0;
  return Math.abs(h) % LOOKS;
}

const sectionKey = (skill) => String(skill?.num ?? "").split(".").map((n) => Number.parseInt(n, 10) || 0);

/** Skills of a cluster in prerequisite order; ties broken by section number. Skills not generated yet are skipped. */
export function orderSkills(world, cluster) {
  const byId = new Map(world.skills.map((s) => [s.id, s]));
  const ids = cluster.skills.filter((id) => byId.has(id));
  const inCluster = new Set(ids);
  const compare = (a, b) => {
    const x = sectionKey(byId.get(a)), y = sectionKey(byId.get(b));
    for (let i = 0; i < Math.max(x.length, y.length); i++) {
      const d = (x[i] ?? 0) - (y[i] ?? 0);
      if (d) return d;
    }
    return ids.indexOf(a) - ids.indexOf(b);
  };
  const preOf = (id) => (byId.get(id).pre ?? []).filter((p) => inCluster.has(p) && p !== id);
  const placed = new Set();
  const out = [];
  while (out.length < ids.length) {
    const left = ids.filter((id) => !placed.has(id)).sort(compare);
    // Kahn's algorithm; a cycle (already reported by check-world) must not stall the layout
    const next = left.find((id) => preOf(id).every((p) => placed.has(p))) ?? left[0];
    placed.add(next);
    out.push(next);
  }
  return out;
}

// Size and contents of one town
function planTown(world, cluster, byId) {
  const ordered = orderSkills(world, cluster);
  const kindOf = (id) => byId.get(id).kind;
  const main = ordered.filter((id) => ["core", "supplement"].includes(kindOf(id)));
  const edge = ordered.filter((id) => ["app", "tool"].includes(kindOf(id)));
  const alley = ordered.filter((id) => kindOf(id) === "optional");
  const lamps = [...main, ...edge];
  const left = alley.length ? 3 : 0;
  const counts = {};
  for (const id of ordered) { const k = byId.get(id).ktype?.[0]; if (k) counts[k] = (counts[k] ?? 0) + 1; }
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0];
  return {
    cluster, lamps, alley, left,
    tier: cluster.tier ?? 1,
    land: LAND[top] ?? "park",
    w: Math.max(MIN_TOWN_W, left + 2 + 2 * lamps.length + 1 + GYM_W),
    h: Math.max(MIN_TOWN_H, alley.length ? 9 + 2 * alley.length : 0),
  };
}

/**
 * @param {object} world  merged world (may be in progress)
 * @returns {{ width, height, tiles: string[][], objects: object[], towns: object[], spawn: {x,y}, occupied: Set<string> }}
 */
export function buildMap(world) {
  const r = rng(world.id);
  const byId = new Map(world.skills.map((s) => [s.id, s]));
  const plans = world.clusters.map((c) => planTown(world, c, byId));

  // Snake placement: rows of towns, left to right then right to left (engine C1 design 3.1)
  const n = plans.length;
  const cols = n <= 1 ? 1 : Math.min(MAX_COLS, Math.ceil(Math.sqrt(n)));
  const rows = Math.max(1, Math.ceil(n / cols));
  const cellW = Math.max(MIN_TOWN_W, ...plans.map((p) => p.w));
  const townH = Math.max(MIN_TOWN_H, ...plans.map((p) => p.h));
  plans.forEach((p, i) => {
    const row = Math.floor(i / cols), c = i % cols;
    p.row = row;
    p.col = row % 2 ? cols - 1 - c : c;
    p.x = BORDER + MARGIN + p.col * (cellW + ROAD);
    p.y = TOWN_TOP + row * (townH + VGAP);
    p.sy = p.y + STREET;
    p.gymX = p.x + p.w - GYM_W;
    p.vx = p.gymX - 1;   // free column from top to bottom of the town: roads to other rows use it
  });
  const hasHall = n > 1;
  const width = Math.max(2 * (BORDER + MARGIN) + cols * cellW + (cols - 1) * ROAD, 2 * (BORDER + MARGIN) + MIN_TOWN_W);
  const height = TOWN_TOP + rows * townH + (rows - 1) * VGAP + (hasHall ? VGAP + HALL_H : 0) + 2 + BORDER;
  const sy0 = TOWN_TOP + STREET;

  const tiles = Array.from({ length: height }, () => Array(width).fill("grass"));
  const reserved = new Set();
  const objects = [];
  const towns = [];
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < width && y < height) tiles[y][x] = t; };
  const reserve = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) reserved.add(key(x, y)); };

  // A lamp, the sign for its subject practices and the npcs for its commission practices
  function addSkillObjects(skillId, lx, ly, signAt, npcAt) {
    objects.push({ kind: "lamp", x: lx, y: ly, skill: skillId });
    const own = world.practices.filter((p) => p.skill === skillId);
    const subject = own.filter((p) => p.context !== "commission").map((p) => p.id);
    if (subject.length) objects.push({ kind: "sign", x: signAt[0], y: signAt[1], skill: skillId, practices: subject });
    own.filter((p) => p.context === "commission").forEach((p, j) => {
      const at = npcAt(j);
      if (at) objects.push({ kind: "npc", x: at[0], y: at[1], skill: skillId, practice: p.id, look: hashLook(p.id) });
    });
  }

  for (const p of plans) {
    const ox = p.x, oy = p.y, sy = p.sy;
    for (let y = oy; y < oy + p.h; y++) for (let x = ox; x < ox + p.w; x++) set(x, y, p.land);
    reserve(ox - 1, oy - 1, ox + p.w, oy + p.h);
    for (let x = ox; x < ox + p.w; x++) set(x, sy, "pave");

    for (let hx = ox + p.left + 1, k = 0; hx + HOUSE_W <= p.gymX - 1; hx += HOUSE_W + 2, k++) {
      objects.push({ kind: "house", x: hx, y: oy + 1, w: HOUSE_W, h: HOUSE_H, roof: k % 2, land: p.land, cluster: p.cluster.id, index: k });
    }
    objects.push({ kind: "gym", x: p.gymX, y: oy + 2, w: GYM_W, h: GYM_H, boss: p.cluster.boss ?? null, cluster: p.cluster.id });

    p.lamps.forEach((id, k) => {
      const lx = ox + p.left + 2 + 2 * k;
      addSkillObjects(id, lx, sy - 1, [lx + 1, sy - 1], (j) => (j < MAX_NPC_MAIN ? [lx + (j % 2), sy + 2 + Math.floor(j / 2)] : null));
    });

    if (p.alley.length) {
      for (let y = sy + 1; y <= oy + p.h - 2; y++) set(ox + 1, y, "pave");
      p.alley.forEach((id, j) => {
        const ly = sy + 2 + 2 * j;
        addSkillObjects(id, ox, ly, [ox, ly + 1], (k) => (k < MAX_NPC_ALLEY ? [ox + 2 + k, ly] : null));
      });
    }

    towns.push({ cluster: p.cluster.id, name: p.cluster.name ?? p.cluster.id, tier: p.tier, land: p.land, x: ox, y: oy, w: p.w, h: p.h, entrance: { x: ox, y: sy } });
  }

  // Gate across a road where the next chapter is a higher tier: cliff tiles, stairs on the road, a gate object
  const gate = (cells, stair, gx, gy, from, to) => {
    for (const [x, y] of cells) set(x, y, "cliff");
    set(stair[0], stair[1], "stairs");
    objects.push({ kind: "gate", x: gx, y: gy, w: 2, h: 1, from, to });
  };

  // Roads between consecutive towns
  plans.forEach((a, i) => {
    const b = plans[i + 1];
    if (!b) return;
    const up = b.tier > a.tier;
    if (a.row === b.row) {
      const [l, r] = a.x < b.x ? [a, b] : [b, a];
      const rx0 = l.x + l.w, rx1 = r.x - 1, sy = a.sy;
      for (let x = rx0; x <= rx1; x++) set(x, sy, "sand");
      for (let x = rx0 + 2; x <= rx1 - 2; x++) for (const dy of [-3, -2, -1, 1, 2, 3]) set(x, sy + dy, "tall");
      reserve(rx0, sy - 4, rx1, sy + 4);
      if (up) {
        const mx = a.x < b.x ? rx1 - 1 : rx0 + 1;
        const cells = [];
        for (let y = sy - 4; y <= sy + 4; y++) if (y !== sy) cells.push([mx, y]);
        gate(cells, [mx, sy], mx, sy - 5, a.tier, b.tier);
      }
    } else {
      // Down from a's free column, across the gap between rows, down into b's free column
      const mid = a.y + townH + Math.floor(VGAP / 2);
      for (let y = a.sy + 1; y <= mid; y++) set(a.vx, y, "sand");
      for (let x = Math.min(a.vx, b.vx); x <= Math.max(a.vx, b.vx); x++) set(x, mid, "sand");
      for (let y = mid; y < b.sy; y++) set(b.vx, y, "sand");
      const gx0 = Math.min(a.vx, b.vx) - 4, gx1 = Math.max(a.vx, b.vx) + 4;
      for (let y = a.y + townH + 1; y < b.y - 1; y++) for (let x = gx0; x <= gx1; x++) {
        if (y !== mid && x !== a.vx && x !== b.vx && Math.abs(y - mid) <= 2) set(x, y, "tall");
      }
      reserve(gx0, a.y + townH, gx1, b.y - 1);
      if (up) {
        const gy = b.y - 2, cells = [];
        for (let x = gx0; x <= gx1; x++) if (x !== b.vx) cells.push([x, gy]);
        gate(cells, [b.vx, gy], b.vx + 1, gy - 1, a.tier, b.tier);
      }
    }
  });

  // The road ends at the final hall below the last town
  if (hasHall) {
    const last = plans[n - 1];
    const hy = last.y + townH + VGAP;
    for (let y = last.sy + 1; y < hy; y++) set(last.vx, y, "sand");
    const hx = last.vx - 2;
    reserve(hx - 2, last.y + townH, hx + HALL_W + 1, hy + HALL_H);
    objects.push({ kind: "hall", x: hx, y: hy, w: HALL_W, h: HALL_H, boss: world.schools?.[0]?.finalBoss ?? null });
  }

  const spawn = towns.length ? { x: towns[0].entrance.x + 1, y: plans[0].sy } : { x: BORDER + MARGIN + 1, y: sy0 };
  if (!towns.length) reserve(BORDER + MARGIN, sy0 - 2, width - BORDER - MARGIN - 1, sy0 + 2);

  // Decorations: forest border with a ragged inner edge, groves, ponds and flowers outside reserved areas
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (reserved.has(key(x, y))) continue;
    const edge = Math.min(x, y, width - 1 - x, height - 1 - y);
    if (edge < BORDER || (edge === BORDER && r() < 0.5)) tiles[y][x] = "tree";
  }
  const free = (x, y) => x >= BORDER && y >= BORDER && x < width - BORDER && y < height - BORDER
    && !reserved.has(key(x, y)) && tiles[y][x] === "grass";
  const groves = Math.floor((width * height) / 160);
  for (let n = 0; n < groves; n++) {
    const cx = Math.floor(r() * width), cy = Math.floor(r() * height), rad = 1 + Math.floor(r() * 2);
    for (let y = cy - rad; y <= cy + rad; y++) for (let x = cx - rad; x <= cx + rad; x++) {
      if (Math.hypot(x - cx, y - cy) <= rad + 0.3 && free(x, y)) tiles[y][x] = "tree";
    }
  }
  const ponds = 1 + Math.floor(width / 40);
  for (let n = 0; n < ponds; n++) {
    const px = Math.floor(r() * width), py = Math.floor(r() * height);
    const pw = 3 + Math.floor(r() * 2), ph = 2 + Math.floor(r() * 2);
    let ok = true;
    for (let y = py; y < py + ph && ok; y++) for (let x = px; x < px + pw; x++) if (!free(x, y)) { ok = false; break; }
    if (ok) for (let y = py; y < py + ph; y++) for (let x = px; x < px + pw; x++) tiles[y][x] = "water";
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (free(x, y) && r() < 0.04) tiles[y][x] = "flower";

  const occupied = new Set();
  for (const o of objects) {
    for (let dy = 0; dy < (o.h ?? 1); dy++) for (let dx = 0; dx < (o.w ?? 1); dx++) occupied.add(key(o.x + dx, o.y + dy));
  }
  return { width, height, tiles, objects, towns, spawn, occupied };
}

/** True when the hero may stand on the tile. */
export function isWalkable(map, x, y) {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  return WALKABLE.has(map.tiles[y][x]) && !map.occupied.has(key(x, y));
}

/** The object whose footprint covers the tile, or null. */
export function objectAt(map, x, y) {
  return map.objects.find((o) => x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1)) ?? null;
}

/** The object the hero would talk to: the faced tile first, then any neighbour. */
export function interactTarget(map, x, y, facing) {
  const [dx, dy] = FACING[facing] ?? FACING.down;
  const ahead = objectAt(map, x + dx, y + dy);
  if (ahead) return ahead;
  for (const [ax, ay] of Object.values(FACING)) {
    const o = objectAt(map, x + ax, y + ay);
    if (o) return o;
  }
  return null;
}

// Walkable tiles next to an object's footprint
function sidesOf(map, o) {
  const out = [];
  for (let y = o.y - 1; y <= o.y + (o.h ?? 1); y++) for (let x = o.x - 1; x <= o.x + (o.w ?? 1); x++) {
    const inside = x >= o.x && x < o.x + (o.w ?? 1) && y >= o.y && y < o.y + (o.h ?? 1);
    const diagonal = (x < o.x || x >= o.x + (o.w ?? 1)) && (y < o.y || y >= o.y + (o.h ?? 1));
    if (!inside && !diagonal && isWalkable(map, x, y)) out.push({ x, y });
  }
  return out;
}

/** Breadth-first distances (in steps) from a tile to every reachable tile. */
export function distances(map, from) {
  const dist = new Map([[key(from.x, from.y), 0]]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dy] of Object.values(FACING)) {
      const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
      if (!dist.has(k) && isWalkable(map, nx, ny)) {
        dist.set(k, dist.get(key(cur.x, cur.y)) + 1);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return dist;
}

/** Steps needed to stand next to an object, given distances(); Infinity when unreachable. */
export function distanceTo(map, dist, o) {
  return Math.min(Infinity, ...sidesOf(map, o).map((s) => dist.get(key(s.x, s.y)) ?? Infinity));
}

/**
 * Shortest path to a tile or to the side of an object.
 * @returns {{x,y}[] | null}  steps after `from` ([] when already there), null when unreachable
 */
export function findPath(map, from, target) {
  const goals = new Set();
  if (target.kind) for (const s of sidesOf(map, target)) goals.add(key(s.x, s.y));
  else if (isWalkable(map, target.x, target.y)) goals.add(key(target.x, target.y));
  else for (const [dx, dy] of Object.values(FACING)) if (isWalkable(map, target.x + dx, target.y + dy)) goals.add(key(target.x + dx, target.y + dy));
  if (goals.has(key(from.x, from.y))) return [];
  const prev = new Map([[key(from.x, from.y), null]]);
  const queue = [{ x: from.x, y: from.y }];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const [dx, dy] of Object.values(FACING)) {
      const nx = cur.x + dx, ny = cur.y + dy, k = key(nx, ny);
      if (prev.has(k) || !isWalkable(map, nx, ny)) continue;
      prev.set(k, cur);
      if (goals.has(k)) {
        const path = [{ x: nx, y: ny }];
        for (let p = cur; p && prev.get(key(p.x, p.y)) !== null; p = prev.get(key(p.x, p.y))) path.unshift({ x: p.x, y: p.y });
        return path;
      }
      queue.push({ x: nx, y: ny });
    }
  }
  return null;
}
