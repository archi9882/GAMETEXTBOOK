// Copy SmilesDrawer (MIT) from node_modules into engine/vendor/smiles-drawer so molecules draw offline.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";

const src = new URL("../node_modules/smiles-drawer/", import.meta.url);
const dst = new URL("../engine/vendor/smiles-drawer/", import.meta.url);

if (!existsSync(src)) {
  console.error("node_modules/smiles-drawer not found: run npm install first");
  process.exit(1);
}

rmSync(dst, { recursive: true, force: true });
mkdirSync(dst, { recursive: true });
cpSync(new URL("dist/smiles-drawer.min.js", src), new URL("smiles-drawer.min.js", dst));
cpSync(new URL("LICENSE.md", src), new URL("LICENSE.md", dst));
console.log("SmilesDrawer copied to engine/vendor/smiles-drawer");
