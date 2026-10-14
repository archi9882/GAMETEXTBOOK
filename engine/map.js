// Canvas map view: camera, grid movement, keyboard and pointer input, interaction (design spec 4.6).
import { T, paintTile, paintObject, paintHero, paintTargetMarker } from "./tiles.js";
import { findPath, isWalkable, objectAt, interactTarget } from "./layout.js";

const STEP_MS = 150;      // time to walk one tile
const VIEW_W = 15, VIEW_H = 10;   // tiles that should fit on screen at the chosen scale
const ANIM_MS = 180;      // water and glow animation frame length
const DUSK_MAX = 0.62;    // night tint when no lamp is lit (engine C1 design 4)
const LAMP_LIGHT = 3.2, HERO_LIGHT = 1.8;   // light radii in tiles
const MOVES = {
  arrowup: [0, -1, "up"], w: [0, -1, "up"],
  arrowdown: [0, 1, "down"], s: [0, 1, "down"],
  arrowleft: [-1, 0, "left"], a: [-1, 0, "left"],
  arrowright: [1, 0, "right"], d: [1, 0, "right"],
};
const TEXT_FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/**
 * @param {HTMLCanvasElement} canvas
 * @param {object} map  from layout.buildMap
 * @param {{ start?: {x:number,y:number}, objectState(obj): object, target(): object|null,
 *           onInteract(obj): void, onArrive?(pos: {x:number,y:number}): void,
 *           ambient?(): number }} hooks  ambient: share of lamps lit, 0..1; the map darkens toward dusk as it falls
 */
export function createMapView(canvas, map, hooks) {
  const g = canvas.getContext("2d");
  const start = hooks.start && isWalkable(map, hooks.start.x, hooks.start.y) ? hooks.start : map.spawn;
  const hero = { x: start.x, y: start.y, facing: "down", fromX: start.x, fromY: start.y, t0: -Infinity };
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let path = [], pending = null, held = null, arrivePending = false;
  let scale = 3, dpr = 1, frame = 0, lastAnim = 0, running = true;
  let camera = { ox: 0, oy: 0 };
  const shade = document.createElement("canvas");

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr));
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr));
    scale = Math.max(2, Math.floor(Math.min(canvas.width / (VIEW_W * T), canvas.height / (VIEW_H * T))));
  }

  const moving = (now) => now - hero.t0 < STEP_MS;

  function tryStep(dx, dy, facing, now) {
    hero.facing = facing;
    if (!isWalkable(map, hero.x + dx, hero.y + dy)) return false;
    hero.fromX = hero.x; hero.fromY = hero.y;
    hero.x += dx; hero.y += dy;
    hero.t0 = now;
    arrivePending = true;
    return true;
  }

  function faceToward(obj) {
    const cx = Math.max(obj.x, Math.min(hero.x, obj.x + (obj.w ?? 1) - 1));
    const cy = Math.max(obj.y, Math.min(hero.y, obj.y + (obj.h ?? 1) - 1));
    const dx = cx - hero.x, dy = cy - hero.y;
    hero.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
  }

  function update(now) {
    if (moving(now)) return;
    if (arrivePending) { arrivePending = false; hooks.onArrive?.({ x: hero.x, y: hero.y }); }
    if (path.length) {
      const next = path.shift();
      const dx = next.x - hero.x, dy = next.y - hero.y;
      const facing = dx > 0 ? "right" : dx < 0 ? "left" : dy > 0 ? "down" : "up";
      if (!tryStep(dx, dy, facing, now)) path = [];
      return;
    }
    if (pending) {
      const obj = pending;
      pending = null;
      faceToward(obj);
      hooks.onInteract(obj);
      return;
    }
    if (held) tryStep(held[0], held[1], held[2], now);
  }

  function same(x, y, kinds) {
    const at = (xx, yy) => yy >= 0 && yy < map.height && xx >= 0 && xx < map.width && kinds.includes(map.tiles[yy][xx]);
    return { up: at(x, y - 1), down: at(x, y + 1), left: at(x - 1, y), right: at(x + 1, y) };
  }

  function draw(now) {
    const W = canvas.width, H = canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#1d3b22";
    g.fillRect(0, 0, W, H);

    // Camera follows the interpolated hero position, snapped to whole device pixels
    const k = Math.min(1, (now - hero.t0) / STEP_MS);
    const hx = hero.fromX + (hero.x - hero.fromX) * k, hy = hero.fromY + (hero.y - hero.fromY) * k;
    const size = T * scale;
    camera = { ox: Math.round(W / 2 - (hx * T + T / 2) * scale), oy: Math.round(H / 2 - (hy * T + T / 2) * scale) };
    g.setTransform(scale, 0, 0, scale, camera.ox, camera.oy);

    const x0 = Math.max(0, Math.floor(-camera.ox / size) - 1), y0 = Math.max(0, Math.floor(-camera.oy / size) - 1);
    const x1 = Math.min(map.width - 1, x0 + Math.ceil(W / size) + 2), y1 = Math.min(map.height - 1, y0 + Math.ceil(H / size) + 2);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      paintTile(g, map.tiles[y][x], x * T, y * T, { tx: x, ty: y, frame, same: (kinds) => same(x, y, kinds) });
    }

    // Objects and hero sorted by their bottom edge so nearer things overlap farther ones
    const visible = map.objects.filter((o) => o.x + (o.w ?? 1) >= x0 && o.x <= x1 && o.y + (o.h ?? 1) >= y0 && o.y <= y1 + 1);
    const items = [...visible.map((o) => ({ z: o.y + (o.h ?? 1), o })), { z: hy + 1.01, hero: true }].sort((a, b) => a.z - b.z);
    const target = hooks.target();
    const lights = [];
    for (const item of items) {
      if (item.hero) {
        paintHero(g, hx * T, hy * T, hero.facing, moving(now) ? Math.floor(now / 120) % 2 : 0);
        continue;
      }
      const st = hooks.objectState(item.o);
      paintObject(g, item.o, item.o.x * T, item.o.y * T, { ...st, frame });
      if (st.lamp === "lit") lights.push([item.o.x * T + 8, item.o.y * T - 2, LAMP_LIGHT]);
    }
    lights.push([hx * T + 8, hy * T + 8, HERO_LIGHT]);
    drawDusk(W, H, lights);
    if (target && visible.includes(target)) { g.setTransform(scale, 0, 0, scale, camera.ox, camera.oy); paintTargetMarker(g, target.x * T, target.y * T, frame); }
  }

  // Night tint over the whole view, with holes of warm light around lit lamps and the hero
  function drawDusk(W, H, lights) {
    const dark = DUSK_MAX * (1 - Math.max(0, Math.min(1, hooks.ambient?.() ?? 1)));
    if (dark < 0.01) return;
    if (shade.width !== W || shade.height !== H) { shade.width = W; shade.height = H; }
    const s = shade.getContext("2d");
    s.globalCompositeOperation = "source-over";
    s.clearRect(0, 0, W, H);
    s.fillStyle = `rgba(14, 18, 42, ${dark.toFixed(3)})`;
    s.fillRect(0, 0, W, H);
    s.globalCompositeOperation = "destination-out";
    const px = (v, o) => o + v * scale;
    for (const [x, y, r] of lights) {
      const cx = px(x, camera.ox), cy = px(y, camera.oy), rad = r * T * scale;
      if (cx < -rad || cy < -rad || cx > W + rad || cy > H + rad) continue;
      const grad = s.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(0.55, "rgba(0,0,0,0.75)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      s.fillStyle = grad;
      s.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(shade, 0, 0);
    // A faint warm wash where the lamps shine
    g.globalCompositeOperation = "lighter";
    for (const [x, y, r] of lights.slice(0, -1)) {
      const cx = px(x, camera.ox), cy = px(y, camera.oy), rad = r * T * scale * 0.8;
      if (cx < -rad || cy < -rad || cx > W + rad || cy > H + rad) continue;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      grad.addColorStop(0, `rgba(255, 196, 110, ${(0.22 * dark).toFixed(3)})`); grad.addColorStop(1, "rgba(255, 196, 110, 0)");
      g.fillStyle = grad;
      g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    g.globalCompositeOperation = "source-over";
  }

  function loop(now) {
    if (!running) return;
    if (!still && now - lastAnim > ANIM_MS) { frame++; lastAnim = now; }
    update(now);
    draw(now);
    requestAnimationFrame(loop);
  }

  function interact() {
    const obj = interactTarget(map, hero.x, hero.y, hero.facing);
    if (obj) { faceToward(obj); hooks.onInteract(obj); }
  }

  /** Walk to an object (and talk to it on arrival). Returns false when it cannot be reached. */
  function goTo(obj, interactAfter = true) {
    const steps = findPath(map, hero, obj);
    if (steps === null) return false;
    path = steps;
    pending = interactAfter ? obj : null;
    held = null;
    return true;
  }

  function teleport(x, y) {
    hero.x = hero.fromX = x; hero.y = hero.fromY = y; hero.t0 = -Infinity;
    path = []; pending = null; held = null;
    hooks.onArrive?.({ x, y });
  }

  function onKeyDown(e) {
    const tag = e.target?.tagName;
    if (TEXT_FIELDS.has(tag) || e.target?.isContentEditable || e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key.toLowerCase();
    if (MOVES[key]) { held = MOVES[key]; path = []; pending = null; e.preventDefault(); return; }
    if (tag === "BUTTON") return;   // let space and enter activate the focused button
    if (key === "e" || key === " " || key === "enter") { e.preventDefault(); interact(); }
  }
  function onKeyUp(e) {
    if (held && MOVES[e.key.toLowerCase()] === held) held = null;
  }
  function onPointer(e) {
    const rect = canvas.getBoundingClientRect();
    const size = T * scale;
    const tx = Math.floor(((e.clientX - rect.left) * dpr - camera.ox) / size);
    const ty = Math.floor(((e.clientY - rect.top) * dpr - camera.oy) / size);
    const obj = objectAt(map, tx, ty);
    if (obj) goTo(obj);
    else { path = findPath(map, hero, { x: tx, y: ty }) ?? []; pending = null; held = null; }
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  canvas.addEventListener("pointerdown", onPointer);
  resize();
  requestAnimationFrame(loop);

  return {
    hero,
    goTo,
    teleport,
    interact,
    destroy() {
      running = false;
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      canvas.removeEventListener("pointerdown", onPointer);
    },
  };
}
