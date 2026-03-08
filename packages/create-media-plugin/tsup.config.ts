import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ["src/cli.ts", "src/index.ts"],
  format: ["esm", "cjs"],
  outDir: "dist",
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: "node24",
  shims: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".js",
    };
  },
});
