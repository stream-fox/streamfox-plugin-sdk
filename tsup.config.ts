import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/advanced.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  clean: false,
  splitting: false,
  sourcemap: true,
  target: "node20",
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
  esbuildOptions(options) {
    options.logOverride = {
      ...(options.logOverride ?? {}),
      "empty-import-meta": "silent",
    };
  },
});
