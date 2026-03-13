import { createRequire } from "node:module";

const esm = await import("../dist/index.js");
if (typeof esm.definePlugin !== "function") {
  throw new Error("ESM build missing definePlugin export");
}
if (typeof esm.createServer !== "function") {
  throw new Error("ESM build missing createServer export");
}

const require = createRequire(import.meta.url);
const cjs = require("../dist/index.cjs");
if (typeof cjs.definePlugin !== "function") {
  throw new Error("CJS build missing definePlugin export");
}
if (typeof cjs.createServer !== "function") {
  throw new Error("CJS build missing createServer export");
}

console.log("Module smoke test passed");
