import { describe, expect, it, vi } from "vitest";
import { definePlugin, serve } from "../src/index";

describe("serve integration", () => {
  const plugin = definePlugin({
    plugin: {
      id: "com.example.serve",
      name: "Serve",
      version: "1.0.0",
    },
    resources: {
      meta: {
        mediaTypes: ["movie"],
        handler: async () => ({ item: null }),
      },
    },
  });

  it("returns installURL and launchURL", async () => {
    const result = await serve(plugin, {
      port: 0,
      integration: {
        installScheme: "streamfox-test",
        launchBaseURL: "https://streamfox.example/install",
      },
    });

    try {
      expect(result.url).toContain("/manifest");
      expect(result.installURL.startsWith("streamfox-test://")).toBe(true);
      expect(result.launchURL).toContain("addonOpen=");
      expect(decodeURIComponent(result.launchURL)).toContain(result.url);
    } finally {
      await result.close();
    }
  });

  it("autoOpen install uses integration openURL hook", async () => {
    const openURL = vi.fn();

    const result = await serve(plugin, {
      port: 0,
      integration: {
        autoOpen: "install",
        openURL,
      },
    });

    try {
      expect(openURL).toHaveBeenCalledTimes(1);
      expect((openURL.mock.calls[0] ?? [])[0]).toBe(result.installURL);
    } finally {
      await result.close();
    }
  });

  it("autoOpen launch uses integration openURL hook", async () => {
    const openURL = vi.fn();

    const result = await serve(plugin, {
      port: 0,
      integration: {
        autoOpen: "launch",
        launchBaseURL: "https://streamfox.example/launch",
        openURL,
      },
    });

    try {
      expect(openURL).toHaveBeenCalledTimes(1);
      expect((openURL.mock.calls[0] ?? [])[0]).toBe(result.launchURL);
    } finally {
      await result.close();
    }
  });
});
