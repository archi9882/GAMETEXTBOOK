// The engine and the app must not be tied to any particular book (CLAUDE.md section 5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const banned = [/sadiku/i, /alexander/i, /electric circuits/i, /電路學/, /電路之城/, /歐姆/, /\bohm/i, /kirchhoff/i, /naghettini/i, /hydrology/i];

for (const name of ["engine", "app"]) {
  test(`${name} files contain no book-specific text`, () => {
    const dir = new URL(`../${name}/`, import.meta.url);
    const files = readdirSync(dir).filter((f) => /\.(js|html)$/.test(f));
    for (const f of files) {
      const text = readFileSync(new URL(f, dir), "utf8");
      for (const b of banned) assert.ok(!b.test(text), `${name}/${f} matches ${b}`);
    }
  });
}
