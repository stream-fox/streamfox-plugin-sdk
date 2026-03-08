import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  clean: false,
  splitting: false,
  sourcemap: true,
  target: "node24",
  shims: true,
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
});
