// Tests for the local static server used to open the engine and browser test pages.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createStaticServer } from "../tools/serve.mjs";

let server;
let base;

before(async () => {
  server = createStaticServer(new URL("..", import.meta.url));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

test("serves a file with its content type", async () => {
  const res = await fetch(`${base}/package.json`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.equal((await res.json()).name, "expert-quest");
});

test("serves JavaScript modules as text/javascript", async () => {
  const res = await fetch(`${base}/engine/expr.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/javascript/);
});

test("returns 404 for a missing file", async () => {
  const res = await fetch(`${base}/no-such-file.txt`);
  assert.equal(res.status, 404);
});

test("refuses paths that escape the root", async () => {
  const res = await fetch(`${base}/..%2f..%2fWindows%2fwin.ini`);
  assert.equal(res.status, 403);
});

test("refuses gitignored player data", async () => {
  for (const p of ["/library/.gitkeep", "/worlds/.gitkeep", "/.git/HEAD", "/.env"]) {
    const res = await fetch(base + p);
    assert.equal(res.status, 403, p);
  }
});
