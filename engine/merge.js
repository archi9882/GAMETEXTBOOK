// Import pasted AI replies and merge world parts into one world (framework 4.6, 8.7).
// Pure functions, no dependencies: shared by the app and tools/validate.mjs.

export class ImportError extends Error {
  constructor(message) {
    super(message);
    this.name = "ImportError";
  }
}

// Fields replaced wholesale by a later part; `share` only appears in class versions (framework 7.4)
const SCALARS = ["framework", "title", "lang", "source", "license", "player", "theme", "share"];

// List fields and the key that identifies an item in each (framework 8.7 rule 3)
const LISTS = {
  schools: (x) => x.id,
  clusters: (x) => x.id,
  skills: (x) => x.id,
  practices: (x) => x.id,
  placement: (x) => x.id,
  bosses: (x) => x.id,
  achievements: (x) => x.id,
  glossary: (x) => x.term,
  bridges: (x) => `${x.a}|${x.b}`,
  sources: (x) => x.url,
};

// Lists every world has even when empty (required by the schema); the others appear only when used
const REQUIRED_LISTS = ["schools", "clusters", "skills", "practices", "placement", "bosses", "achievements", "glossary"];

const FENCE = /```[^\n]*\n([\s\S]*?)```/g;

/**
 * Turn pasted text (a raw JSON file or an AI reply with ```json blocks) into parsed objects.
 * @param {string} text
 * @returns {object[]}  one object per JSON document found
 */
export function parseImport(text) {
  const clean = String(text).replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const blocks = [...clean.matchAll(FENCE)].map((m) => m[1]);
  const sources = blocks.length ? blocks : [clean];
  return sources.map((src, i) => {
    try {
      return JSON.parse(src);
    } catch (e) {
      const where = blocks.length ? `code block ${i + 1}` : "input";
      throw new ImportError(`${where} is not valid JSON: ${e.message}`);
    }
  });
}

// Classify one imported object as a full world or a part; returns a normalized part
function asPart(obj, index) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new ImportError(`item ${index + 1} is not a JSON object`);
  if (obj.kind === "part") {
    if (typeof obj.world !== "string" || !obj.world) throw new ImportError(`part ${index + 1} has no world id`);
    return obj;
  }
  if (obj.kind === undefined && typeof obj.id === "string" && typeof obj.framework === "string") {
    // A complete world.json behaves like one part that covers everything
    const { id, ...rest } = obj;
    return { ...rest, kind: "part", world: id, part: "world", complete: true };
  }
  throw new ImportError(`item ${index + 1} is neither a world nor a world part (kind: ${obj.kind ?? "none"})`);
}

/**
 * Merge parts in order into one world.
 * @param {object[]} items  full worlds and/or parts, in import order
 * @returns {{ world: object, complete: boolean }}
 */
export function mergeParts(items) {
  const parts = items.map(asPart);
  if (parts.length === 0) throw new ImportError("nothing to merge");

  const worldId = parts[0].world;
  for (const p of parts) {
    if (p.world !== worldId) throw new ImportError(`part ${p.part ?? "?"} belongs to world ${p.world}, expected ${worldId}`);
  }

  const world = { id: worldId };
  for (const name of REQUIRED_LISTS) world[name] = [];
  world.report = {};
  let complete = false;

  for (const p of structuredClone(parts)) {
    for (const f of SCALARS) if (p[f] !== undefined) world[f] = p[f];

    for (const [name, keyOf] of Object.entries(LISTS)) {
      if (!Array.isArray(p[name])) continue;
      const list = world[name] ?? (world[name] = []);
      for (const item of p[name]) {
        const i = list.findIndex((x) => keyOf(x) === keyOf(item));
        if (i >= 0) list[i] = item;
        else list.push(item);
      }
    }

    if (p.report && typeof p.report === "object") Object.assign(world.report, p.report);

    for (const [name, keys] of Object.entries(p.remove ?? {})) {
      const keyOf = LISTS[name];
      if (!keyOf) throw new ImportError(`part ${p.part ?? "?"} removes from unknown list ${name}`);
      if (world[name]) world[name] = world[name].filter((x) => !keys.includes(keyOf(x)));
    }

    if (p.complete === true) complete = true;
  }

  return { world, complete };
}
