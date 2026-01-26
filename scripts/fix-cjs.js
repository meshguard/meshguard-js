// Add package.json with {"type":"commonjs"} to dist/cjs so Node resolves .js as CJS
import { writeFileSync } from "fs";
writeFileSync("dist/cjs/package.json", '{"type":"commonjs"}\n');
console.log("✓ dist/cjs/package.json written");
