// The demo world shipped on the home page must stay valid as the framework and checks evolve.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compileSchema } from "../tools/validate.mjs";
import { checkWorld } from "../engine/check-world.js";
import { mergeParts } from "../engine/merge.js";

const dir = new URL("../examples/openstax-kinematics/", import.meta.url);
const read = (path) => JSON.parse(readFileSync(new URL(path, dir), "utf8"));
const world = read("world.json");

test("demo world passes the schema and every check", () => {
  const validate = compileSchema();
  assert.ok(validate(world), JSON.stringify(validate.errors, null, 2));
  assert.deepEqual(checkWorld(world), { errors: [], warnings: [] });
});

test("demo world.json is exactly its parts merged in order", () => {
  const parts = ["head", "ch2a", "ch2b", "final"].map((p) => read(`parts/${p}.json`));
  const merged = mergeParts(parts);
  assert.equal(merged.complete, true);
  assert.deepEqual(merged.world, world);
});
