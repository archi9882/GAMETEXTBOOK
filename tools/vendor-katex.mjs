// Copy KaTeX (MIT) from node_modules into engine/vendor/katex so the engine works offline.
// Only woff2 fonts are copied; every current browser supports them.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const src = new URL("../node_modules/katex/", import.meta.url);
const dst = new URL("../engine/vendor/katex/", import.meta.url);

if (!existsSync(src)) {
  console.error("node_modules/katex not found: run npm install first");
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(new URL("contrib/", dst), { recursive: true });

cpSync(new URL("dist/katex.min.css", src), new URL("katex.min.css", dst));
cpSync(new URL("dist/katex.min.js", src), new URL("katex.min.js", dst));
for (const f of ["mhchem.min.js", "auto-render.min.js"]) {
  cpSync(new URL(`dist/contrib/${f}`, src), new URL(`contrib/${f}`, dst));
}
cpSync(new URL("dist/fonts/", src), new URL("fonts/", dst), {
  recursive: true,
  filter: (path) => !/\.(ttf|woff)$/i.test(path),
});
cpSync(new URL("LICENSE", src), new URL("LICENSE", dst));
console.log("KaTeX copied to engine/vendor/katex");
