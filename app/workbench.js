// Turn pasted AI replies into stored world records (app design spec 3, 4).
// Pure functions shared by app/app.js and engine/main.js; storage is the caller's job.
import { parseImport, mergeParts, ImportError } from "../engine/merge.js";
import { checkWorld, assertShape } from "../engine/check-world.js";
import { touchReview } from "./review.js";
import { isClassWorld } from "../engine/share.js";

/** Name shown for an imported document: the part name, or "world" for a full world file. */
export function partLabel(doc) {
  return doc?.kind === "part" ? String(doc.part ?? "?") : "world";
}

/** World id a list of documents belongs to; undefined when the first one has none. */
export function worldIdOf(docs) {
  const d = docs[0];
  const id = d?.kind === "part" ? d.world : d?.id;
  return typeof id === "string" && id ? id : undefined;
}

/**
 * Parse pasted text and find which world it belongs to.
 * @returns {{ docs: object[], worldId: string | undefined }}
 * @throws {ImportError} when the text has no valid JSON or mixes several worlds
 */
export function readPaste(text) {
  const docs = parseImport(text);
  const ids = [...new Set(docs.map((d) => worldIdOf([d])).filter(Boolean))];
  if (ids.length > 1) throw new ImportError(`one paste contains parts of several worlds: ${ids.join(", ")}`);
  return { docs, worldId: worldIdOf(docs) };
}

// checkWorld must never break the workbench; a crash becomes one error.
// A class version had restricted content removed on purpose, so missing items are only warnings.
function check(world, complete) {
  try {
    return checkWorld(world, { partial: !complete || isClassWorld(world) });
  } catch (e) {
    return { errors: [`check: check failed: ${e.message}`], warnings: [] };
  }
}

/**
 * Merge new documents after a stored record (framework 8.7 rule 1) and validate the result.
 * A full world file covers everything, so it drops the parts before it.
 * @param {object | undefined} existing  stored record of the same world
 * @param {object[]} docs  newly imported documents
 * @param {string} now  ISO time of this import
 * @returns {object}  new record { id, world, complete, parts, imports, importedAt, issues, review? }
 * @throws {ImportError} when merging fails or the engine could not load the result
 */
export function applyImport(existing, docs, now) {
  const oldParts = existing?.parts ?? [];
  const oldImports = existing?.imports ?? oldParts.map((d) => ({ part: partLabel(d), at: null }));
  let allParts = [...oldParts, ...docs];
  let imports = [...oldImports, ...docs.map((d) => ({ part: partLabel(d), at: now }))];
  const lastWorld = allParts.findLastIndex((d) => d?.kind !== "part");
  if (lastWorld > 0) {
    allParts = allParts.slice(lastWorld);
    imports = imports.slice(lastWorld);
  }

  const { world, complete } = mergeParts(allParts);
  const problems = assertShape(world);
  if (problems.length) throw new ImportError(problems.slice(0, 5).join("；"));
  const rec = { id: world.id, world, complete, parts: allParts, imports, importedAt: now, issues: check(world, complete) };
  // Teacher review marks survive imports; items the new parts replaced are flagged for another look
  if (existing?.review) rec.review = touchReview(existing.review, docs);
  return rec;
}

/** Re-run the checks on a stored record (after a restore, or when the checker changed). */
export function recheck(rec) {
  return { ...rec, issues: check(rec.world, rec.complete) };
}

/** Rows for the part list; an earlier import of a part name imported again later is "replaced". */
export function partRows(rec) {
  const rows = rec.imports ?? (rec.parts ?? []).map((d) => ({ part: partLabel(d), at: null }));
  return rows.map((r, i) => ({ ...r, replaced: rows.slice(i + 1).some((later) => later.part === r.part) }));
}
