// Tests for tools/build-site.mjs: the published site holds what players need and nothing private.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildSite } from "../tools/build-site.mjs";

test("the site includes the app, engine, framework and demo, and precaches them", () => {
  const dir = mkdtempSync(join(tmpdir(), "site-"));
  try {
    buildSite(dir);
    for (const f of ["index.html", "manifest.webmanifest", "app/index.html", "engine/index.html", "engine/vendor/katex/katex.min.js",
      "framework/expert-quest-framework.md", "examples/openstax-kinematics/world.json", "sw.js", ".nojekyll"]) {
      assert.ok(existsSync(join(dir, f)), f);
    }
    for (const f of ["library", "worlds", "pipeline", "test", "CLAUDE.md", "node_modules", "examples/fundamentals-of-electric-circuits"]) {
      assert.ok(!existsSync(join(dir, f)), `${f} must not be published`);
    }
    const sw = readFileSync(join(dir, "sw.js"), "utf8");
    assert.match(sw, /"app\/app\.js"/);
    assert.match(sw, /"engine\/vendor\/katex\/fonts\/KaTeX_Main-Regular\.woff2"/);
    assert.doesNotMatch(sw, /"sw\.js"/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
