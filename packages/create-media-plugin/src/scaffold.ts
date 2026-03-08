import { mkdir, writeFile, access } from "node:fs/promises";
import path from "node:path";

export type Capability = "catalog" | "meta" | "stream" | "subtitles" | "plugin_catalog";
export type Language = "ts" | "js";
export type DependencyMode = "local" | "registry";

export interface ScaffoldOptions {
  targetDir: string;
  projectName: string;
  language: Language;
  capabilities: Capability[];
  dependencyMode?: DependencyMode;
}

const capabilityOrder: Capability[] = ["catalog", "meta", "stream", "subtitles", "plugin_catalog"];

function sortedCapabilities(values: Capability[]): Capability[] {
  const unique = Array.from(new Set(values));
  return capabilityOrder.filter((capability) => unique.includes(capability));
}

async function ensureTargetDoesNotExist(targetDir: string): Promise<void> {
  try {
    await access(targetDir);
    throw new Error(`Target directory already exists: ${targetDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return;
    }
    throw error;
  }
}

function localDependencyPaths(): { sdk: string; http: string } {
  const packageRoot = path.resolve(__dirname, "..");
  const packagesRoot = path.resolve(packageRoot, "..");

  return {
    sdk: path.resolve(packagesRoot, "media-plugin-sdk"),
    http: path.resolve(packagesRoot, "media-plugin-http"),
  };
}

function manifestCapabilityBlock(capability: Capability): string {
  switch (capability) {
    case "catalog":
      return `{
      kind: "catalog",
      endpoints: [
        {
          id: "top",
          name: "Top",
          mediaTypes: ["movie"],
          filters: [{ key: "genre", valueType: "string" }],
        },
      ],
    }`;
    case "meta":
      return `{
      kind: "meta",
      mediaTypes: ["movie"],
      includes: ["videos", "links"],
    }`;
    case "stream":
      return `{
      kind: "stream",
      mediaTypes: ["movie"],
      deliveryKinds: ["direct_url"],
      supportsInlineSubtitles: true,
    }`;
    case "subtitles":
      return `{
      kind: "subtitles",
      mediaTypes: ["movie"],
      defaultLanguages: ["en"],
    }`;
    case "plugin_catalog":
      return `{
      kind: "plugin_catalog",
      endpoints: [
        {
          id: "featured",
          name: "Featured",
          pluginKinds: ["catalog", "meta"],
          tags: ["official"],
        },
      ],
    }`;
    default:
      return "";
  }
}

function tsHandlerBlock(capability: Capability): string {
  switch (capability) {
    case "catalog":
      return `catalog: async () => ({
      schemaVersion: { major: 2, minor: 0 },
      items: [],
    }),`;
    case "meta":
      return `meta: async () => ({
      schemaVersion: { major: 2, minor: 0 },
      item: null,
    }),`;
    case "stream":
      return `stream: async () => ({
      schemaVersion: { major: 2, minor: 0 },
      streams: [],
    }),`;
    case "subtitles":
      return `subtitles: async () => ({
      schemaVersion: { major: 2, minor: 0 },
      subtitles: [],
    }),`;
    case "plugin_catalog":
      return `pluginCatalog: async () => ({
      schemaVersion: { major: 2, minor: 0 },
      plugins: [],
    }),`;
    default:
      return "";
  }
}

function jsHandlerBlock(capability: Capability): string {
  return tsHandlerBlock(capability);
}

function makePackageJson(name: string, language: Language, dependencyMode: DependencyMode): string {
  const scripts =
    language === "ts"
      ? {
          dev: "tsx watch src/server.ts",
          build: "tsc -p tsconfig.json",
          start: "node dist/server.js",
          test: "vitest run",
        }
      : {
          dev: "node --watch src/server.js",
          build: "echo \"No build step for JavaScript template\"",
          start: "node src/server.js",
          test: "vitest run",
        };

  const localPaths = localDependencyPaths();

  const packageJson = {
    name,
    version: "0.1.0",
    private: true,
    type: "module",
    scripts,
    dependencies: {
      "@streamhub/media-plugin-http":
        dependencyMode === "local" ? `file:${localPaths.http}` : "^0.1.0",
      "@streamhub/media-plugin-sdk":
        dependencyMode === "local" ? `file:${localPaths.sdk}` : "^0.1.0",
    },
    devDependencies:
      language === "ts"
        ? {
            "@types/node": "^24.6.0",
            tsx: "^4.20.5",
            typescript: "^5.9.2",
            vitest: "^2.1.9",
          }
        : {
            vitest: "^2.1.9",
          },
  };

  return `${JSON.stringify(packageJson, null, 2)}\n`;
}

function makeTsPlugin(name: string, capabilities: Capability[]): string {
  const capabilityBlocks = capabilities.map(manifestCapabilityBlock).join("\n    ,");
  const handlerBlocks = capabilities.map(tsHandlerBlock).join("\n    ");

  return `import { createPlugin, type Manifest } from "@streamhub/media-plugin-sdk";

const manifest: Manifest = {
  schemaVersion: { major: 2, minor: 0 },
  plugin: {
    id: "com.example.${name}",
    name: "${name}",
    version: "0.1.0",
    description: "Generated plugin scaffold",
  },
  capabilities: [
    ${capabilityBlocks}
  ],
};

export const plugin = createPlugin({
  manifest,
  handlers: {
    ${handlerBlocks}
  },
});
`;
}

function makeJsPlugin(name: string, capabilities: Capability[]): string {
  const capabilityBlocks = capabilities.map(manifestCapabilityBlock).join("\n    ,");
  const handlerBlocks = capabilities.map(jsHandlerBlock).join("\n    ");

  return `import { createPlugin } from "@streamhub/media-plugin-sdk";

const manifest = {
  schemaVersion: { major: 2, minor: 0 },
  plugin: {
    id: "com.example.${name}",
    name: "${name}",
    version: "0.1.0",
    description: "Generated plugin scaffold",
  },
  capabilities: [
    ${capabilityBlocks}
  ],
};

export const plugin = createPlugin({
  manifest,
  handlers: {
    ${handlerBlocks}
  },
});
`;
}

function makeServerFile(language: Language): string {
  const pluginImport = language === "ts" ? "./plugin" : "./plugin.js";
  return `import { serve } from "@streamhub/media-plugin-http";
import { plugin } from "${pluginImport}";

const { url } = await serve(plugin, {
  port: Number(process.env.PORT ?? 7000),
  frontend: {
    enabled: true,
  },
});

console.log("Plugin manifest:", url);
console.log("Plugin studio:", url.replace("/manifest.json", "/"));
`;
}

function makeVitestFile(language: Language): string {
  const pluginImport = language === "ts" ? "../src/plugin" : "../src/plugin.js";
  return `import { describe, expect, it } from "vitest";
import { createServer } from "@streamhub/media-plugin-http";
import { plugin } from "${pluginImport}";

describe("scaffold smoke", () => {
  it("serves manifest", async () => {
    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/manifest.json");
    expect(response.status).toBe(200);
  });
});
`;
}

const tsConfig = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"]
  },
  "include": ["src"]
}
`;

function makeReadme(projectName: string): string {
  return `# ${projectName}

Generated with create-media-plugin.

## Scripts

- npm run dev
- npm run build
- npm run start
- npm run test

## Endpoints

- GET /manifest.json
- POST /catalog
- POST /meta
- POST /stream
- POST /subtitles
- POST /plugin_catalog
`;
}

export async function scaffoldProject(options: ScaffoldOptions): Promise<void> {
  const capabilities = sortedCapabilities(options.capabilities);
  if (capabilities.length === 0) {
    throw new Error("At least one capability is required");
  }

  const dependencyMode = options.dependencyMode ?? "local";

  await ensureTargetDoesNotExist(options.targetDir);

  const srcDir = path.join(options.targetDir, "src");
  const testDir = path.join(options.targetDir, "test");

  await mkdir(srcDir, { recursive: true });
  await mkdir(testDir, { recursive: true });

  await writeFile(
    path.join(options.targetDir, "package.json"),
    makePackageJson(options.projectName, options.language, dependencyMode),
  );
  await writeFile(path.join(options.targetDir, "README.md"), makeReadme(options.projectName));

  if (options.language === "ts") {
    await writeFile(path.join(options.targetDir, "tsconfig.json"), tsConfig);
    await writeFile(path.join(srcDir, "plugin.ts"), makeTsPlugin(options.projectName, capabilities));
    await writeFile(path.join(srcDir, "server.ts"), makeServerFile("ts"));
    await writeFile(path.join(testDir, "plugin.test.ts"), makeVitestFile("ts"));
  } else {
    await writeFile(path.join(srcDir, "plugin.js"), makeJsPlugin(options.projectName, capabilities));
    await writeFile(path.join(srcDir, "server.js"), makeServerFile("js"));
    await writeFile(path.join(testDir, "plugin.test.js"), makeVitestFile("js"));
  }
}
