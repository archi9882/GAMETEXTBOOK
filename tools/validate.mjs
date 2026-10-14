#!/usr/bin/env node
// Validate world files or world parts: JSON Schema first, then engine/check-world.js.
// Usage: node tools/validate.mjs <world.json> [more.json ...]
//        node tools/validate.mjs <head.json> <ch1.json> ...   parts are merged in the given order (framework 8.7)
// Files may be raw JSON or a pasted AI reply containing ```json blocks.
// Exit code: 0 all valid, 1 any file invalid or unreadable, 2 usage error.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { checkWorld } from "../engine/check-world.js";
import { parseImport, mergeParts } from "../engine/merge.js";

const SCHEMA_URL = new URL("../schema/world.schema.json", import.meta.url);

/** Compile the world schema; strictTypes is a style lint and is turned off. */
export function compileSchema() {
  const ajv = new Ajv2020({ allErrors: true, strictTypes: false, strictRequired: false });
  addFormats(ajv);
  return ajv.compile(JSON.parse(readFileSync(SCHEMA_URL, "utf8")));
}

/**
 * Validate one parsed world.
 * @param {object} world
 * @param {Function} [validate]  compiled schema
 * @param {{ partial?: boolean }} [options]  partial: world still in progress (framework 8.7)
 * @returns {{ stage: "schema" | "check", errors: string[], warnings: string[] }}
 */
export function validateWorld(world, validate = compileSchema(), options = {}) {
  if (!validate(world)) {
    const errors = validate.errors.map((e) => `${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`);
    // check-world assumes a schema-valid shape, so stop here
    return { stage: "schema", errors, warnings: [] };
  }
  return { stage: "check", ...checkWorld(world, options) };
}

// Print one validation result; returns true when it has errors
function report({ stage, errors, warnings }) {
  for (const e of errors) console.log(`  [${stage}] error: ${e}`);
  for (const w of warnings) console.log(`  [${stage}] warning: ${w}`);
  if (errors.length) console.log(`  FAILED at ${stage} step: ${errors.length} error(s)`);
  else console.log(`  OK (${warnings.length} warning(s))`);
  return errors.length > 0;
}

function main(files) {
  if (files.length === 0) {
    console.error("usage: node tools/validate.mjs <world.json | part files ...>");
    return 2;
  }
  const validate = compileSchema();

  // Read every file; each may be a plain JSON file or a pasted AI reply with code blocks
  const docs = [];
  let failed = false;
  for (const file of files) {
    try {
      for (const obj of parseImport(readFileSync(file, "utf8"))) docs.push({ file, obj });
    } catch (e) {
      console.log(`== ${file}`);
      console.log(`  cannot read: ${e.message}`);
      failed = true;
    }
  }
  if (failed) return 1;

  // Any part means the inputs are pieces of one world: merge them in the given order
  if (docs.some((d) => d.obj?.kind === "part")) {
    let merged;
    try {
      merged = mergeParts(docs.map((d) => d.obj));
    } catch (e) {
      console.log(`  cannot merge: ${e.message}`);
      return 1;
    }
    const state = merged.complete ? "complete" : "in progress";
    console.log(`== merged ${docs.length} part(s) into world ${merged.world.id} (${state})`);
    return report(validateWorld(merged.world, validate, { partial: !merged.complete })) ? 1 : 0;
  }

  for (const { file, obj } of docs) {
    console.log(`== ${file}`);
    if (report(validateWorld(obj, validate))) failed = true;
  }
  return failed ? 1 : 0;
}

// Run only when executed directly, not when imported by tests
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
