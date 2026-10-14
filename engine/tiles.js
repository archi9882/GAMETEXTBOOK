// Pixel tile and sprite painters (16x16), ported from the approved mockup
// docs/superpowers/specs/assets/map-art-v5.html. All art is drawn with code; no external images.

export const T = 16;

const C = {
  grass: "#8fd27f", grass2: "#82c673", grassDot: "#a6e08f",
  meadow: "#b8e3a2", meadowDot: "#c9ecb4",
  sand: "#ead9a0", sandEdge: "#d2bd7e", sandDot: "#dccb8d",
  pave: "#e6dfcc", paveLine: "#d3cab2",
  plateau: "#c9d98a", plateauDot: "#b7c977",
  tall: "#4f9e4c", tallDark: "#3c8139", tallLight: "#74c062",
  treeDark: "#2d6e35", treeMid: "#43943f", treeLight: "#69bb55", treeHi: "#93d671", trunk: "#6b4a2b",
  water: "#5aa6e8", waterDeep: "#4a90d6", waterHi: "#a9d6f7", foam: "#e9f6ff",
  cliffTop: "#c89b68", cliffFace: "#a06d45", cliffDark: "#7a5032", cliffLine: "#5f3c25",
  plank: "#cf9f57", plankDark: "#91672f",
  wall: "#f3e8d2", wallShade: "#d9cbb0",
  roofs: [["#d4574a", "#a83e33"], ["#4d7fd1", "#365fa3"]], roofP: "#8a63c9", roofPDark: "#674397",
  door: "#6b4a2b", win: "#a9dcf5", winFrame: "#5d7f93",
  post: "#4a4a4a", bulb: "#fff4b0", glow: "rgba(255, 228, 120, 0.35)", bulbOff: "#9a9a9a", star: "#ffd54a",
  skin: "#f6d2ad", eye: "#333", legs: "#3b3f58",
  winLit: "#ffd27a", winLitHi: "#fff1c4",
};
// Town grounds and roofs by landscape (engine C1 design 3.2)
const LANDS = {
  park: { base: "#9ed58a", dot: "#b6e3a0", roofs: [["#5f9e4c", "#467a37"], ["#c9704a", "#9c5236"]] },
  dock: { base: "#b9c7d3", dot: "#a3b3c2", line: "#8fa1b2", roofs: [["#3f78b5", "#2d5a8a"], ["#e3e8ee", "#b8c2cc"]] },
  brick: { base: "#d9b08a", dot: "#c79a72", line: "#b98563", roofs: [["#a8532f", "#7d3c21"], ["#6b5a4a", "#4f4236"]] },
  stone: { base: "#cfcbc2", dot: "#bcb7ac", line: "#aaa497", roofs: [["#5d6370", "#454a55"], ["#8a7354", "#6a573f"]] },
  plaza: { base: "#d6c6d8", dot: "#c3b0c6", line: "#ac96b0", roofs: [["#8a5aa3", "#684379"], ["#c98aa6", "#a06a83"]] },
};
const SHIRTS = ["#3b6fd1", "#d1883b", "#3bb08f", "#b04a8f", "#8f6fd1", "#5c8f3b"];
const HAIR = ["#5a3a22", "#222222", "#c2a14d", "#7a3b22", "#3d2a18", "#a35a2a"];

function px(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }

// Stable pseudo-random value per tile, so details do not move with the camera
function hash(x, y, salt) {
  let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function ground(g, X, Y, base, dot, tx, ty) {
  px(g, X, Y, T, T, base);
  for (let i = 0; i < 3; i++) {
    if (hash(tx, ty, i) < 0.6) px(g, X + 1 + Math.floor(hash(tx, ty, i + 7) * 14), Y + 1 + Math.floor(hash(tx, ty, i + 13) * 14), 1, 1, dot);
  }
}

function sand(g, X, Y, tx, ty, n) {
  px(g, X, Y, T, T, C.sand);
  for (let i = 0; i < 2; i++) px(g, X + Math.floor(hash(tx, ty, i + 3) * 15), Y + Math.floor(hash(tx, ty, i + 5) * 15), 2, 1, C.sandDot);
  if (!n.up) px(g, X, Y, T, 1, C.sandEdge);
  if (!n.down) px(g, X, Y + 15, T, 1, C.sandEdge);
  if (!n.left) px(g, X, Y, 1, T, C.sandEdge);
  if (!n.right) px(g, X + 15, Y, 1, T, C.sandEdge);
}

// Town ground: flat colour with a faint pattern; harbour, brick, stone and plaza are laid in courses
function landGround(g, X, Y, land, tx, ty) {
  const L = LANDS[land];
  ground(g, X, Y, L.base, L.dot, tx, ty);
  if (!L.line) return;
  px(g, X, Y + 15, T, 1, L.line);
  px(g, X + ((ty % 2) ? 0 : 8), Y, 1, 15, L.line);
}

function pave(g, X, Y) {
  px(g, X, Y, T, T, C.pave);
  px(g, X, Y + 7, T, 1, C.paveLine); px(g, X + 7, Y, 1, 7, C.paveLine);
  px(g, X + 3, Y + 8, 1, 8, C.paveLine); px(g, X + 11, Y + 8, 1, 8, C.paveLine);
}

function tall(g, X, Y) {
  px(g, X, Y, T, T, C.tall);
  for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
    const bx = X + col * 4 + (row % 2) * 2, by = Y + row * 4;
    px(g, bx, by + 1, 1, 3, C.tallDark); px(g, bx + 1, by, 1, 3, C.tallLight); px(g, bx + 2, by + 1, 1, 3, C.tallDark);
  }
}

function tree(g, X, Y) {
  px(g, X + 6, Y + 13, 4, 3, C.trunk);
  const rows = [[4, 8], [2, 12], [1, 14], [1, 14], [0, 16], [0, 16], [0, 16], [0, 16], [1, 14], [1, 14], [2, 12], [4, 8]];
  rows.forEach(([o, w], i) => px(g, X + o, Y + i, w, 1, C.treeMid));
  rows.forEach(([o, w], i) => { if (i > 5) px(g, X + o + w - 5, Y + i, 5, 1, C.treeDark); });
  px(g, X + 3, Y + 2, 5, 2, C.treeLight); px(g, X + 2, Y + 4, 4, 2, C.treeLight); px(g, X + 4, Y + 3, 2, 1, C.treeHi);
  px(g, X + 9, Y + 6, 3, 2, C.treeLight); px(g, X + 5, Y + 8, 3, 2, C.treeLight);
  px(g, X + 1, Y + 11, 14, 1, C.treeDark);
}

function water(g, X, Y, n, t) {
  px(g, X, Y, T, T, C.water);
  px(g, X, Y + 8, T, 8, C.waterDeep);
  const s = ((t % 16) + 16) % 16;
  px(g, X + (s % 12), Y + 4, 4, 1, C.waterHi); px(g, X + ((s + 7) % 12), Y + 11, 3, 1, C.waterHi);
  if (!n.up) { px(g, X, Y, T, 2, C.foam); px(g, X, Y + 2, T, 1, C.waterHi); }
  if (!n.left) px(g, X, Y, 2, T, C.foam);
  if (!n.right) px(g, X + 14, Y, 2, T, C.foam);
  if (!n.down) px(g, X, Y + 14, T, 2, C.foam);
}

function cliff(g, X, Y, n) {
  px(g, X, Y, T, T, C.cliffFace);
  for (let k = 0; k < 4; k++) { px(g, X, Y + k * 4 + 3, T, 1, C.cliffDark); px(g, X + ((k * 5) % 13), Y + k * 4 + 1, 3, 1, C.cliffTop); }
  if (!n.up) { px(g, X, Y, T, 3, C.plateau); px(g, X, Y + 3, T, 1, C.cliffLine); }
  if (!n.left) px(g, X, Y, 1, T, C.cliffLine);
  if (!n.right) px(g, X + 15, Y, 1, T, C.cliffLine);
}

function stairs(g, X, Y) {
  px(g, X, Y, T, T, C.cliffTop);
  for (let k = 0; k < 4; k++) { px(g, X + 1, Y + k * 4, 14, 3, C.sand); px(g, X + 1, Y + k * 4 + 3, 14, 1, C.cliffDark); }
}

function flower(g, X, Y, tx, ty) {
  const c = hash(tx, ty, 21) < 0.5 ? "#f6f0f0" : "#f4d65b";
  px(g, X + 4, Y + 5, 2, 2, c); px(g, X + 10, Y + 9, 2, 2, c); px(g, X + 6, Y + 11, 2, 2, "#e86f7d");
}

/**
 * Paint one tile at pixel position (X, Y).
 * @param {{ tx: number, ty: number, frame: number, same: (kinds: string[]) => { up, down, left, right } }} ctx
 */
export function paintTile(g, kind, X, Y, ctx) {
  const { tx, ty } = ctx;
  switch (kind) {
    case "grass": ground(g, X, Y, (tx + ty) % 2 ? C.grass : C.grass2, C.grassDot, tx, ty); break;
    case "flower": ground(g, X, Y, C.grass, C.grassDot, tx, ty); flower(g, X, Y, tx, ty); break;
    case "meadow": ground(g, X, Y, C.meadow, C.meadowDot, tx, ty); break;
    case "plateau": ground(g, X, Y, C.plateau, C.plateauDot, tx, ty); break;
    case "pave": pave(g, X, Y); break;
    case "sand": sand(g, X, Y, tx, ty, ctx.same(["sand", "pave", "stairs"])); break;
    case "tall": tall(g, X, Y); break;
    case "tree": ground(g, X, Y, C.grass2, C.grassDot, tx, ty); tree(g, X, Y); break;
    case "water": water(g, X, Y, ctx.same(["water"]), ctx.frame + tx * 3 + ty); break;
    case "cliff": cliff(g, X, Y, ctx.same(["cliff", "stairs"])); break;
    case "stairs": stairs(g, X, Y); break;
    case "park": case "dock": case "brick": case "stone": case "plaza": landGround(g, X, Y, kind, tx, ty); break;
    default: px(g, X, Y, T, T, "#000");
  }
}

function house(g, X, Y, roofIndex, land, lit) {
  const palette = LANDS[land]?.roofs ?? C.roofs;
  const [roof, roofDark] = palette[roofIndex % palette.length];
  const W = 4 * T;
  px(g, X + 2, Y + 2, W - 4, 20, roof);
  for (let k = 0; k < 5; k++) px(g, X + 2, Y + 4 + k * 4, W - 4, 1, roofDark);
  px(g, X, Y + 20, W, 3, roofDark);
  px(g, X + 3, Y + 23, W - 6, 23, C.wall); px(g, X + 3, Y + 42, W - 6, 4, C.wallShade);
  px(g, X + 26, Y + 30, 12, 16, C.door); px(g, X + 36, Y + 37, 1, 2, "#e8c66a");
  // Windows glow as the chapter's lamps come on (lit: 0, 1 or 2 windows)
  [8, 44].forEach((wx, k) => {
    const on = k < lit;
    px(g, X + wx, Y + 28, 12, 9, C.winFrame);
    px(g, X + wx + 1, Y + 29, 10, 7, on ? C.winLit : C.win);
    px(g, X + wx + 1, Y + 29, 4, 2, on ? C.winLitHi : "#e9f8ff");
  });
}

// Stone gate beside the road at a tier increase (two tiles wide)
function gateArt(g, X, Y) {
  px(g, X + 2, Y - 10, 5, 26, "#8a93a6"); px(g, X + 25, Y - 10, 5, 26, "#8a93a6");
  px(g, X, Y - 14, 32, 5, "#a7afbf"); px(g, X + 1, Y - 13, 30, 1, "#c9cfda");
  px(g, X + 2, Y + 14, 5, 2, "#5d6370"); px(g, X + 25, Y + 14, 5, 2, "#5d6370");
}

// Final hall at the end of the road
function hall(g, X, Y, lit) {
  const W = 5 * T;
  px(g, X + 4, Y + 18, W - 8, 46, "#59607a"); px(g, X + 4, Y + 60, W - 8, 4, "#3e4459");
  for (const tx of [4, 28, 52]) { px(g, X + tx, Y + 4, 24, 16, "#6e7692"); px(g, X + tx + 8, Y, 8, 6, "#6e7692"); }
  px(g, X + 30, Y + 36, 20, 28, lit ? C.winLit : "#1f2330");
  px(g, X + 12, Y + 28, 8, 10, lit ? C.winLit : "#1f2330"); px(g, X + 60, Y + 28, 8, 10, lit ? C.winLit : "#1f2330");
}

function gym(g, X, Y) {
  const W = 6 * T;
  px(g, X + 2, Y + 4, W - 4, 24, C.roofP);
  for (let k = 0; k < 6; k++) px(g, X + 2, Y + 6 + k * 4, W - 4, 1, C.roofPDark);
  px(g, X, Y + 26, W, 4, C.roofPDark);
  px(g, X + 3, Y + 30, W - 6, 32, C.wall); px(g, X + 3, Y + 58, W - 6, 4, C.wallShade);
  px(g, X + 38, Y + 40, 20, 22, C.door);
  px(g, X + 30, Y + 31, 36, 8, "#f0c94c"); px(g, X + 31, Y + 32, 34, 6, "#fbe48a");
  for (const wx of [10, 72]) { px(g, X + wx, Y + 42, 12, 10, C.winFrame); px(g, X + wx + 1, Y + 43, 10, 8, C.win); }
}

function lamp(g, X, Y, state, frame) {
  const lit = state === "lit";
  if (lit) { g.fillStyle = C.glow; g.beginPath(); g.arc(X + 8, Y - 2, 9 + (frame % 2), 0, Math.PI * 2); g.fill(); }
  px(g, X + 7, Y, 2, 15, C.post); px(g, X + 5, Y + 14, 6, 2, C.post);
  px(g, X + 4, Y - 4, 8, 4, C.post); px(g, X + 5, Y - 3, 6, 2, lit ? C.bulb : C.bulbOff);
  if (state === "ready") { px(g, X + 12, Y - 7, 1, 3, C.star); px(g, X + 11, Y - 6, 3, 1, C.star); }
}

function sign(g, X, Y) {
  px(g, X + 7, Y + 8, 2, 7, C.trunk); px(g, X + 2, Y + 2, 12, 7, C.plankDark); px(g, X + 3, Y + 3, 10, 5, C.plank);
  px(g, X + 5, Y + 5, 6, 1, C.plankDark);
}

function person(g, X, Y, shirt, hair, facing = "down", step = 0) {
  px(g, X + 4, Y + 1, 8, 5, hair);
  if (facing !== "up") {
    px(g, X + 5, Y + 4, 6, 4, C.skin);
    if (facing === "down") { px(g, X + 6, Y + 6, 1, 1, C.eye); px(g, X + 9, Y + 6, 1, 1, C.eye); }
    if (facing === "left") px(g, X + 6, Y + 6, 1, 1, C.eye);
    if (facing === "right") px(g, X + 9, Y + 6, 1, 1, C.eye);
  } else {
    px(g, X + 5, Y + 4, 6, 4, hair);
  }
  px(g, X + 4, Y + 8, 8, 5, shirt);
  px(g, X + 3, Y + 9, 1, 3, C.skin); px(g, X + 12, Y + 9, 1, 3, C.skin);
  px(g, X + 5, Y + 13 - (step ? 1 : 0), 2, 3, C.legs); px(g, X + 9, Y + 13 - (step ? 0 : 1), 2, 3, C.legs);
}

function bubble(g, X, Y) {
  px(g, X + 4, Y - 12, 8, 10, "#ffffff"); px(g, X + 5, Y - 13, 6, 1, "#ffffff"); px(g, X + 7, Y - 2, 2, 2, "#ffffff");
  px(g, X + 7, Y - 11, 2, 5, "#e2402f"); px(g, X + 7, Y - 5, 2, 2, "#e2402f");
}

/**
 * Paint a map object at pixel position (X, Y) of its top-left tile.
 * @param {{ lamp?: string, bubble?: boolean, frame: number }} state
 */
export function paintObject(g, obj, X, Y, state) {
  switch (obj.kind) {
    case "house": house(g, X, Y, obj.roof ?? 0, obj.land, state.windows ?? 0); break;
    case "gate": gateArt(g, X, Y); break;
    case "hall": hall(g, X, Y, !!state.lit); break;
    case "gym": gym(g, X, Y); break;
    case "lamp": lamp(g, X, Y, state.lamp ?? "blocked", state.frame); break;
    case "sign": sign(g, X, Y); break;
    case "npc":
      person(g, X, Y, SHIRTS[obj.look % SHIRTS.length], HAIR[obj.look % HAIR.length]);
      if (state.bubble) bubble(g, X, Y);
      break;
  }
}

/** The player character, with a two-frame step while walking. */
export function paintHero(g, X, Y, facing, step) {
  person(g, X, Y, "#2f5fb8", "#d8402f", facing, step);
}

/** Orange "!" floating above the suggested next lamp. */
export function paintTargetMarker(g, X, Y, frame) {
  const bob = frame % 2;
  px(g, X + 6, Y - 22 - bob, 4, 7, "#ff7a2f"); px(g, X + 6, Y - 13 - bob, 4, 3, "#ff7a2f");
  px(g, X + 7, Y - 21 - bob, 2, 5, "#ffd2b0");
}
