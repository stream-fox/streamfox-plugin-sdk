import { describe, expect, it } from "vitest";
import { createPlugin, type Manifest } from "@streamhub/media-plugin-sdk";
import { createServer } from "../src/index";

const manifest: Manifest = {
  schemaVersion: { major: 2, minor: 0 },
  plugin: {
    id: "com.example.http",
    name: "HTTP Test Plugin",
    version: "1.0.0",
  },
  capabilities: [{ kind: "meta", mediaTypes: ["movie"] }],
};

describe("createServer", () => {
  it("serves manifest", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => ({ schemaVersion: { major: 2, minor: 0 }, item: null }),
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/manifest.json");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.plugin.id).toBe("com.example.http");
  });

  it("serves studio config with deeplink options", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => ({ schemaVersion: { major: 2, minor: 0 }, item: null }),
      },
    });

    const app = createServer(plugin, {
      frontend: false,
      basePath: "/plugins",
      deeplink: {
        scheme: "stremio",
        enabled: true,
      },
    });

    const response = await app.request("/plugins/studio-config.json");
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.manifestPath).toBe("/plugins/manifest.json");
    expect(body.deeplink.scheme).toBe("stremio");
  });

  it("validates requests and responses with trace id", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => ({
          schemaVersion: { major: 2, minor: 0 },
          item: null,
          cache: { maxAgeSeconds: 120 },
        }),
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/meta", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-trace-id": "trace-abc",
      },
      body: JSON.stringify({
        schemaVersion: { major: 2, minor: 0 },
        mediaType: "movie",
        itemID: "tt125",
      }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-trace-id")).toBe("trace-abc");
    expect(response.headers.get("cache-control")).toContain("max-age=120");
  });

  it("returns typed validation errors", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => ({ schemaVersion: { major: 2, minor: 0 }, item: null }),
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/meta", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: { major: 2, minor: 0 },
        mediaType: "movie",
        itemID: "   ",
      }),
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("REQUEST_INVALID");
  });

  it("normalizes handler exceptions", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => {
          throw new Error("boom");
        },
      },
    });

    const app = createServer(plugin, { frontend: false });
    const response = await app.request("/meta", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: { major: 2, minor: 0 },
        mediaType: "movie",
        itemID: "tt125",
      }),
    });

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
  });
});
