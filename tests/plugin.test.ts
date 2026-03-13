import { describe, expect, it } from "vitest";
import { createPlugin, ProtocolError, type Manifest } from "../src/index";

const manifest: Manifest = {
  schemaVersion: { major: 1, minor: 0 },
  plugin: { id: "com.example.test", name: "Test", version: "1.0.0" },
  capabilities: [{ kind: "meta", mediaTypes: ["movie"] }],
};

describe("createPlugin", () => {
  it("requires handlers declared in manifest", () => {
    expect(() => createPlugin({ manifest, handlers: {} })).toThrow(
      ProtocolError,
    );
  });

  it("rejects undeclared handlers", () => {
    expect(() =>
      createPlugin({
        manifest,
        handlers: {
          meta: async () => ({
            schemaVersion: { major: 1, minor: 0 },
            item: null,
          }),
          stream: async () => ({
            schemaVersion: { major: 1, minor: 0 },
            streams: [],
          }),
        },
      }),
    ).toThrow(ProtocolError);
  });

  it("creates callable plugin", async () => {
    const plugin = createPlugin({
      manifest,
      handlers: {
        meta: async () => ({
          schemaVersion: { major: 1, minor: 0 },
          item: null,
        }),
      },
    });

    const response = await plugin.handle("meta", {
      schemaVersion: { major: 1, minor: 0 },
      mediaType: "movie",
      itemID: "tt123",
    });

    expect(response.item).toBeNull();
  });
});
