import { describe, expect, it } from "vitest";
import { createServer, definePlugin, settings } from "../src/index";

describe("definePlugin", () => {
  it("builds manifest and injects schemaVersion into handler response", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.simple",
        name: "Simple",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({
            item: null,
          }),
        },
      },
    });

    expect(plugin.manifest.schemaVersion.major).toBe(1);
    expect(plugin.manifest.capabilities).toHaveLength(1);

    const response = await plugin.handle("meta", {
      schemaVersion: { major: 1, minor: 0 },
      mediaType: "movie",
      itemID: "tt123",
    });

    expect(response.schemaVersion.major).toBe(1);
    expect(response.item).toBeNull();
  });

  it("parses settings from query and passes typed values to handlers", async () => {
    let captured:
        | {
          maxLinks?: number;
          includeHI?: boolean;
          mode?: string;
          languages?: string[];
        }
      | undefined;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.settings",
        name: "Settings",
        version: "1.0.0",
      },
      install: {
        fields: [
          settings.number("maxLinks", { defaultValue: 20, min: 1 }),
          settings.checkbox("includeHI", { defaultValue: true }),
          settings.select("mode", {
            options: [
              { label: "Fast", value: "fast" },
              { label: "Balanced", value: "balanced" },
            ],
            defaultValue: "balanced",
          }),
          settings.multiSelect("languages", {
            options: [
              { label: "English", value: "en" },
              { label: "Greek", value: "el" },
              { label: "Spanish", value: "es" },
            ],
            defaultValue: ["en"],
          }),
        ],
      },
      resources: {
        subtitles: {
          mediaTypes: ["movie"],
          handler: async (_request, context) => {
            captured = context.settings;
            return {
              subtitles: [],
            };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/subtitles/movie/tt125?maxLinks=5&includeHI=0&mode=fast&languages=el&languages=en");

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      maxLinks: 5,
      includeHI: false,
      mode: "fast",
      languages: ["el", "en"],
    });
  });

  it("rejects request when required install setting is missing", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.required-setting",
        name: "Required Setting",
        version: "1.0.0",
      },
      install: {
        fields: [
          settings.password("token", {
            required: true,
          }),
        ],
      },
      resources: {
        subtitles: {
          mediaTypes: ["movie"],
          handler: async () => ({
            subtitles: [],
          }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/subtitles/movie/tt125");

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
  });

  it("rejects request when multiSelect setting includes unsupported values", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.multi-select-validation",
        name: "Multi Select Validation",
        version: "1.0.0",
      },
      install: {
        fields: [
          settings.multiSelect("languages", {
            options: [
              { label: "English", value: "en" },
              { label: "Greek", value: "el" },
            ],
          }),
        ],
      },
      resources: {
        subtitles: {
          mediaTypes: ["movie"],
          handler: async () => ({
            subtitles: [],
          }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/subtitles/movie/tt125?languages=el&languages=de");

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
  });

  it("rejects malformed schemaVersion query parameter", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.schema-query-validation",
        name: "Schema Query Validation",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({
            item: null,
          }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const malformed = encodeURIComponent(JSON.stringify({ major: 1 }));
    const response = await app.request(`/meta/movie/tt125?schemaVersion=${malformed}`);

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
    expect(body.error.message).toContain("schemaVersion");
  });

  it("returns 404 for legacy .json and flat resource endpoints", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.legacy-routes",
        name: "Legacy Routes",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({
            item: null,
          }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });

    expect((await app.request("/manifest.json")).status).toBe(404);
    expect((await app.request("/studio-config.json")).status).toBe(404);
    expect((await app.request("/meta?mediaType=movie&itemID=tt123")).status).toBe(404);
    expect((await app.request("/catalog")).status).toBe(404);
    expect((await app.request("/stream")).status).toBe(404);
    expect((await app.request("/subtitles")).status).toBe(404);
    expect((await app.request("/plugin_catalog")).status).toBe(404);
  });

  it("serves canonical path-param routes for all resources", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.path-routes",
        name: "Path Routes",
        version: "1.0.0",
      },
      resources: {
        catalog: {
          endpoints: [{ id: "top", name: "Top", mediaTypes: ["movie"] }],
          handler: async () => ({ items: [] }),
        },
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
        stream: {
          mediaTypes: ["movie"],
          deliveryKinds: ["direct_url"],
          handler: async () => ({ streams: [] }),
        },
        subtitles: {
          mediaTypes: ["movie"],
          handler: async () => ({ subtitles: [] }),
        },
        pluginCatalog: {
          endpoints: [{ id: "featured", name: "Featured", pluginKinds: ["catalog"] }],
          handler: async () => ({ plugins: [] }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });

    expect((await app.request("/manifest")).status).toBe(200);
    expect((await app.request("/studio-config")).status).toBe(200);
    expect((await app.request("/catalog/movie/top")).status).toBe(200);
    expect((await app.request("/meta/movie/tt123")).status).toBe(200);
    expect((await app.request("/stream/movie/tt123")).status).toBe(200);
    expect((await app.request("/subtitles/movie/tt123")).status).toBe(200);
    expect((await app.request("/plugin_catalog/featured/catalog")).status).toBe(200);

    expect((await app.request("/catalog/movie")).status).toBe(404);
    expect((await app.request("/meta/movie")).status).toBe(404);
    expect((await app.request("/stream/movie")).status).toBe(404);
    expect((await app.request("/subtitles/movie")).status).toBe(404);
    expect((await app.request("/plugin_catalog/featured")).status).toBe(404);
  });

  it("prefers path identifiers over equivalent query values", async () => {
    let captured:
      | {
          mediaType?: string;
          itemID?: string;
        }
      | undefined;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.path-precedence",
        name: "Path Precedence",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async (request) => {
            captured = {
              mediaType: request.mediaType,
              itemID: request.itemID,
            };
            return { item: null };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/meta/movie/tt123?mediaType=series&itemID=override");

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      mediaType: "movie",
      itemID: "tt123",
    });
  });
});
