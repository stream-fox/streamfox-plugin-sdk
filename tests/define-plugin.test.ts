import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createServer, definePlugin, filters, settings } from "../src/index";

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
    const response = await app.request(
      "/subtitles/movie/tt125?maxLinks=5&includeHI=0&mode=fast&languages=el&languages=en",
    );

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
    const response = await app.request(
      "/subtitles/movie/tt125?languages=el&languages=de",
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
  });

  it("requires schemaMajor and schemaMinor together when overriding schema version", async () => {
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
    const response = await app.request("/meta/movie/tt125?schemaMajor=1");

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
    expect(body.error.message).toContain("schemaMajor");
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
    expect(
      (await app.request("/meta?mediaType=movie&itemID=tt123")).status,
    ).toBe(404);
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
          supportedTransports: ["http"],
          handler: async () => ({ streams: [] }),
        },
        subtitles: {
          mediaTypes: ["movie"],
          handler: async () => ({ subtitles: [] }),
        },
        pluginCatalog: {
          endpoints: [
            { id: "featured", name: "Featured", pluginKinds: ["catalog"] },
          ],
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
    expect((await app.request("/plugin_catalog/featured/catalog")).status).toBe(
      200,
    );

    expect((await app.request("/catalog/movie")).status).toBe(404);
    expect((await app.request("/meta/movie")).status).toBe(404);
    expect((await app.request("/stream/movie")).status).toBe(404);
    expect((await app.request("/subtitles/movie")).status).toBe(404);
    expect((await app.request("/plugin_catalog/featured")).status).toBe(404);
  });

  it("includes installer logo values in studio config", async () => {
    const pluginWithFallbackLogo = definePlugin({
      plugin: {
        id: "com.example.branding-fallback",
        name: "Branding Fallback",
        version: "1.0.0",
        logo: "https://cdn.example.com/plugin-logo.png",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const appWithFallbackLogo = createServer(pluginWithFallbackLogo, {
      frontend: false,
    });
    const fallbackResponse =
      await appWithFallbackLogo.request("/studio-config");
    const fallbackBody = await fallbackResponse.json();

    expect(fallbackResponse.status).toBe(200);
    expect(fallbackBody.installer.logo).toBe(
      "https://cdn.example.com/plugin-logo.png",
    );

    const pluginWithOverrideLogo = definePlugin({
      plugin: {
        id: "com.example.branding-override",
        name: "Branding Override",
        version: "1.0.0",
        logo: "https://cdn.example.com/plugin-logo.png",
      },
      install: {
        logo: "https://cdn.example.com/installer-logo.png",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const appWithOverrideLogo = createServer(pluginWithOverrideLogo, {
      frontend: false,
    });
    const overrideResponse =
      await appWithOverrideLogo.request("/studio-config");
    const overrideBody = await overrideResponse.json();

    expect(overrideResponse.status).toBe(200);
    expect(overrideBody.installer.logo).toBe(
      "https://cdn.example.com/installer-logo.png",
    );
  });

  it("defaults deeplink scheme to streamfox", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.default-deeplink",
        name: "Default Deeplink",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/studio-config");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.deeplink.scheme).toBe("streamfox");
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
    const response = await app.request(
      "/meta/movie/tt123?mediaType=series&itemID=override",
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      mediaType: "movie",
      itemID: "tt123",
    });
  });

  it("parses catalog aliases into the canonical request shape", async () => {
    let captured: unknown;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.catalog-aliases",
        name: "Catalog Aliases",
        version: "1.0.0",
      },
      resources: {
        catalog: {
          endpoints: [
            {
              id: "popular",
              name: "Popular",
              mediaTypes: ["movie"],
              filters: [
                { key: "genre", valueType: "string" },
                { key: "year", valueType: "intRange" },
                { key: "language", valueType: "string" },
              ],
            },
          ],
          handler: async (request) => {
            captured = request;
            return { items: [] };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request(
      "/catalog/movie/popular?genre=Action&year=2024&language=Greek%20(el)&locale=el-GR&regionCode=GR&page=0&pageSize=20&sortKey=popularity&sortDirection=desc&query=matrix&ignored=value",
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      catalogID: "popular",
      mediaType: "movie",
      query: "matrix",
      page: { index: 0, size: 20 },
      sort: { key: "popularity", direction: "descending" },
      filters: [
        { key: "genre", value: { kind: "string", string: "Action" } },
        {
          key: "year",
          value: { kind: "intRange", intRange: { min: 2024, max: 2024 } },
        },
        { key: "language", value: { kind: "string", string: "Greek (el)" } },
      ],
      context: { locale: "el-GR", regionCode: "GR" },
    });
  });

  it("supports shared filter sets and normalizes option aliases", async () => {
    let captured: unknown;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.shared-filter-sets",
        name: "Shared Filter Sets",
        version: "1.0.0",
      },
      resources: {
        catalog: {
          filterSets: {
            commonCatalogFilters: [
              filters.select("language", {
                label: "Language",
                description: "Preferred audio language",
                group: "regional",
                options: [
                  {
                    label: "Japanese",
                    value: "ja",
                    aliases: ["Japanese (ja)"],
                  },
                  { label: "English", value: "en", aliases: ["English (en)"] },
                ],
              }),
              filters.select("genre", {
                options: [
                  { label: "Action", value: "action", aliases: ["Action"] },
                  { label: "Drama", value: "drama" },
                ],
              }),
            ],
          },
          endpoints: [
            {
              id: "discover",
              name: "Discover",
              mediaTypes: ["movie"],
              filterSetRefs: ["commonCatalogFilters"],
              filters: [filters.range("year")],
            },
          ],
          handler: async (request) => {
            captured = request;
            return { items: [] };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request(
      "/catalog/movie/discover?language=Japanese%20(ja)&genre=Action&year=2024&ignored=skip",
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      catalogID: "discover",
      mediaType: "movie",
      filters: [
        { key: "language", value: { kind: "string", string: "ja" } },
        { key: "genre", value: { kind: "string", string: "action" } },
        {
          key: "year",
          value: { kind: "intRange", intRange: { min: 2024, max: 2024 } },
        },
      ],
    });
  });

  it("builds manifest-compatible filter helper objects", () => {
    expect(
      filters.select("language", {
        description: "Preferred language",
        options: [{ label: "Japanese", value: "ja", aliases: ["Japanese (ja)"] }],
      }),
    ).toEqual({
      key: "language",
      valueType: "string",
      control: "select",
      label: "Language",
      description: "Preferred language",
      options: [{ label: "Japanese", value: "ja", aliases: ["Japanese (ja)"] }],
    });

    expect(filters.multiSelect("genres", { options: [] }).valueType).toBe(
      "stringList",
    );
    expect(filters.range("year").control).toBe("range");
    expect(filters.toggle("dubbed").valueType).toBe("bool");
  });

  it("rejects unknown filter set references", () => {
    expect(() =>
      definePlugin({
        plugin: {
          id: "com.example.missing-filter-set",
          name: "Missing Filter Set",
          version: "1.0.0",
        },
        resources: {
          catalog: {
            endpoints: [
              {
                id: "discover",
                name: "Discover",
                mediaTypes: ["movie"],
                filterSetRefs: ["commonCatalogFilters"],
              },
            ],
            handler: async () => ({ items: [] }),
          },
        },
      }),
    ).toThrow(/unknown filter set/i);
  });

  it("rejects duplicate merged filter keys across filter sets and endpoints", () => {
    expect(() =>
      definePlugin({
        plugin: {
          id: "com.example.duplicate-filter-key",
          name: "Duplicate Filter Key",
          version: "1.0.0",
        },
        resources: {
          catalog: {
            filterSets: {
              commonCatalogFilters: [filters.text("language")],
            },
            endpoints: [
              {
                id: "discover",
                name: "Discover",
                mediaTypes: ["movie"],
                filterSetRefs: ["commonCatalogFilters"],
                filters: [filters.select("language", { options: [] })],
              },
            ],
            handler: async () => ({ items: [] }),
          },
        },
      }),
    ).toThrow(/duplicated/i);
  });

  it("rejects aliases that collide with canonical option values", () => {
    expect(() =>
      definePlugin({
        plugin: {
          id: "com.example.alias-collision",
          name: "Alias Collision",
          version: "1.0.0",
        },
        resources: {
          catalog: {
            endpoints: [
              {
                id: "discover",
                name: "Discover",
                mediaTypes: ["movie"],
                filters: [
                  filters.select("language", {
                    options: [
                      { label: "Japanese", value: "ja", aliases: ["en"] },
                      { label: "English", value: "en" },
                    ],
                  }),
                ],
              },
            ],
            handler: async () => ({ items: [] }),
          },
        },
      }),
    ).toThrow(/collides with a canonical option value/i);
  });

  it("parses page-only and experimental aliases", async () => {
    let captured: unknown;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.page-experimental",
        name: "Page Experimental",
        version: "1.0.0",
      },
      resources: {
        pluginCatalog: {
          endpoints: [
            { id: "featured", name: "Featured", pluginKinds: ["catalog"] },
          ],
          handler: async (request) => {
            captured = request;
            return { plugins: [] };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request(
      "/plugin_catalog/featured/catalog?page=0&experimental=streamfox:beta&experimental=debug:limit:2,debug:trace:false",
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      catalogID: "featured",
      pluginKind: "catalog",
      page: { index: 0 },
      experimental: [
        { namespace: "streamfox", key: "beta", value: true },
        { namespace: "debug", key: "limit", value: 2 },
        { namespace: "debug", key: "trace", value: false },
      ],
    });
  });

  it("parses meta and stream aliases into canonical requests", async () => {
    const captured: {
      meta?: unknown;
      stream?: unknown;
    } = {};

    const plugin = definePlugin({
      plugin: {
        id: "com.example.meta-stream-aliases",
        name: "Meta Stream Aliases",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async (request) => {
            captured.meta = request;
            return { item: null };
          },
        },
        stream: {
          mediaTypes: ["movie"],
          supportedTransports: ["http"],
          handler: async (request) => {
            captured.stream = request;
            return { streams: [] };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });

    const metaResponse = await app.request("/meta/movie/tt0133093?locale=el-GR&regionCode=GR");
    expect(metaResponse.status).toBe(200);
    expect(captured.meta).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      mediaType: "movie",
      itemID: "tt0133093",
      context: { locale: "el-GR", regionCode: "GR" },
    });

    const streamResponse = await app.request(
      "/stream/movie/tt0133093?videoID=trailer&startPositionSeconds=123&networkProfile=wifi&locale=el-GR",
    );
    expect(streamResponse.status).toBe(200);
    expect(captured.stream).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      mediaType: "movie",
      itemID: "tt0133093",
      videoID: "trailer",
      playback: { startPositionSeconds: 123, networkProfile: "wifi" },
      context: { locale: "el-GR" },
    });
  });

  it("parses subtitles aliases into canonical requests", async () => {
    let captured: unknown;

    const plugin = definePlugin({
      plugin: {
        id: "com.example.subtitles-aliases",
        name: "Subtitles Aliases",
        version: "1.0.0",
      },
      resources: {
        subtitles: {
          mediaTypes: ["movie"],
          handler: async (request) => {
            captured = request;
            return { subtitles: [] };
          },
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request(
      "/subtitles/movie/tt0133093?videoHash=abc123&videoSize=1234567&filename=matrix.mkv&languagePreferences=el,en&experimental=subs:ranking:fast",
    );

    expect(response.status).toBe(200);
    expect(captured).toEqual({
      schemaVersion: { major: 1, minor: 0 },
      mediaType: "movie",
      itemID: "tt0133093",
      videoFingerprint: {
        hash: "abc123",
        size: 1234567,
        filename: "matrix.mkv",
      },
      languagePreferences: ["el", "en"],
      experimental: [{ namespace: "subs", key: "ranking", value: "fast" }],
    });
  });

  it("rejects legacy JSON-style query payloads for get resource routes", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.reject-json-query",
        name: "Reject JSON Query",
        version: "1.0.0",
      },
      resources: {
        catalog: {
          endpoints: [
            {
              id: "popular",
              name: "Popular",
              mediaTypes: ["movie"],
              filters: [{ key: "genre", valueType: "string" }],
            },
          ],
          handler: async () => ({ items: [] }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request(
      "/catalog/movie/popular?page=%7B%22index%22%3A0%7D&filters=%5B%7B%22key%22%3A%22genre%22%2C%22value%22%3A%7B%22kind%22%3A%22string%22%2C%22string%22%3A%22Action%22%7D%7D%5D&context=%7B%22locale%22%3A%22el-GR%22%7D",
    );

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
    expect(body.error.message).toContain("plain query aliases");
  });

  it("rejects remaining legacy structured query params on get resource routes", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.reject-remaining-legacy-query",
        name: "Reject Remaining Legacy Query",
        version: "1.0.0",
      },
      resources: {
        subtitles: {
          mediaTypes: ["movie"],
          handler: async () => ({ subtitles: [] }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });

    const schemaResponse = await app.request(
      "/subtitles/movie/tt125?schemaVersion=%7B%22major%22%3A1%2C%22minor%22%3A0%7D",
    );
    expect(schemaResponse.status).toBe(400);
    expect((await schemaResponse.json()).error.message).toContain("schemaVersion");

    const experimentalResponse = await app.request(
      "/subtitles/movie/tt125?experimental=%5B%7B%22namespace%22%3A%22x%22%2C%22key%22%3A%22y%22%2C%22value%22%3Atrue%7D%5D",
    );
    expect(experimentalResponse.status).toBe(400);
    expect((await experimentalResponse.json()).error.message).toContain("experimental");

    const fingerprintResponse = await app.request(
      "/subtitles/movie/tt125?videoFingerprint=%7B%22hash%22%3A%22abc%22%7D",
    );
    expect(fingerprintResponse.status).toBe(400);
    expect((await fingerprintResponse.json()).error.message).toContain("videoFingerprint");
  });

  it("returns redirect responses from handlers", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.redirect",
        name: "Redirect",
        version: "1.0.0",
      },
      resources: {
        stream: {
          mediaTypes: ["movie"],
          supportedTransports: ["http"],
          handler: async () => ({
            redirect: {
              url: "https://example.com/stream-redirect",
            },
          }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/stream/movie/tt123");

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/stream-redirect",
    );
  });

  it("exposes configurationRequired in studio config", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.configuration-required",
        name: "Configuration Required",
        version: "1.0.0",
      },
      install: {
        configurationRequired: true,
        fields: [settings.text("token", { required: true })],
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/studio-config");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.installer.configurationRequired).toBe(true);
  });

  it("serves a custom frontend bundle from a custom mount path", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.custom-frontend",
        name: "Custom Frontend",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const distDir = await mkdtemp(path.join(tmpdir(), "streamfox-frontend-"));

    try {
      await mkdir(path.join(distDir, "assets"), { recursive: true });
      await writeFile(
        path.join(distDir, "index.html"),
        "<html><body>custom frontend</body></html>",
      );
      await writeFile(
        path.join(distDir, "assets", "app.js"),
        "console.log('custom frontend');",
      );

      const app = createServer(plugin, {
        frontend: {
          mountPath: "/installer",
          distPath: distDir,
        },
      });

      const indexResponse = await app.request("/installer");
      expect(indexResponse.status).toBe(200);
      expect(await indexResponse.text()).toContain("custom frontend");

      const assetResponse = await app.request("/installer/assets/app.js");
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toContain("custom frontend");
    } finally {
      await rm(distDir, { recursive: true, force: true });
    }
  });

  it("supports overriding the assets mount path for custom frontends", async () => {
    const plugin = definePlugin({
      plugin: {
        id: "com.example.custom-assets-path",
        name: "Custom Assets Path",
        version: "1.0.0",
      },
      resources: {
        meta: {
          mediaTypes: ["movie"],
          handler: async () => ({ item: null }),
        },
      },
    });

    const distDir = await mkdtemp(path.join(tmpdir(), "streamfox-assets-"));

    try {
      await mkdir(path.join(distDir, "assets"), { recursive: true });
      await writeFile(
        path.join(distDir, "index.html"),
        "<html><body>custom assets path</body></html>",
      );
      await writeFile(
        path.join(distDir, "assets", "app.css"),
        "body { color: black; }",
      );

      const app = createServer(plugin, {
        frontend: {
          mountPath: "/installer",
          assetsMountPath: "/public-assets",
          distPath: distDir,
        },
      });

      const assetResponse = await app.request("/public-assets/app.css");
      expect(assetResponse.status).toBe(200);
      expect(await assetResponse.text()).toContain("color: black");
    } finally {
      await rm(distDir, { recursive: true, force: true });
    }
  });
});
