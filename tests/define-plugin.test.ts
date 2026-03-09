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
    const response = await app.request("/subtitles?mediaType=movie&itemID=tt125&maxLinks=5&includeHI=0&mode=fast&languages=el&languages=en");

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
    const response = await app.request("/subtitles?mediaType=movie&itemID=tt125");

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
    const response = await app.request("/subtitles?mediaType=movie&itemID=tt125&languages=el&languages=de");

    expect(response.status).toBe(400);

    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
  });
});
