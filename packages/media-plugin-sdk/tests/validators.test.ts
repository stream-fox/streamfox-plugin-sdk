import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ProtocolError,
  parseJsonWithLimits,
  type Manifest,
  type ResourceRequestMap,
  type ResourceResponseMap,
  validateManifest,
  validateRequest,
  validateResponse,
} from "../src/index";

const fixturesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function fixture<T>(group: "manifest" | "request" | "response", name: string): T {
  const data = readFileSync(path.join(fixturesRoot, group, `${name}.json`), "utf8");
  return JSON.parse(data) as T;
}

describe("manifest parity", () => {
  it("accepts valid manifests", () => {
    const valid = fixture<Manifest>("manifest", "manifest_valid");
    const withExperimental = fixture<Manifest>("manifest", "manifest_with_experimental");

    expect(() => validateManifest(valid)).not.toThrow();
    expect(() => validateManifest(withExperimental)).not.toThrow();
  });

  it("rejects invalid schema and semver", () => {
    const invalidSchema = fixture<Manifest>("manifest", "manifest_invalid_schema_major");
    const invalidSemver = fixture<Manifest>("manifest", "manifest_invalid_semver");

    expect(() => validateManifest(invalidSchema)).toThrow(ProtocolError);
    expect(() => validateManifest(invalidSemver)).toThrow(ProtocolError);
  });

  it("allows unknown keys and rejects duplicate capabilities", () => {
    const unknownTop = fixture<Manifest>("manifest", "manifest_unknown_top_level");
    const unknownCapability = fixture<Manifest>("manifest", "manifest_unknown_capability_key");
    const duplicate = fixture<Manifest>("manifest", "manifest_duplicate_capability");

    expect(() => validateManifest(unknownTop)).not.toThrow();
    expect(() => validateManifest(unknownCapability)).not.toThrow();
    expect(() => validateManifest(duplicate)).toThrow(ProtocolError);
  });
});

describe("request parity", () => {
  const manifest = validateManifest(fixture<Manifest>("manifest", "manifest_valid"));

  it("accepts all valid request fixtures", () => {
    const catalog = fixture<ResourceRequestMap["catalog"]>("request", "request_catalog_valid");
    const meta = fixture<ResourceRequestMap["meta"]>("request", "request_meta_valid");
    const stream = fixture<ResourceRequestMap["stream"]>("request", "request_stream_valid");
    const subtitles = fixture<ResourceRequestMap["subtitles"]>("request", "request_subtitles_valid");
    const pluginCatalog = fixture<ResourceRequestMap["plugin_catalog"]>("request", "request_plugin_catalog_valid");

    expect(() => validateRequest("catalog", catalog, manifest)).not.toThrow();
    expect(() => validateRequest("meta", meta, manifest)).not.toThrow();
    expect(() => validateRequest("stream", stream, manifest)).not.toThrow();
    expect(() => validateRequest("subtitles", subtitles, manifest)).not.toThrow();
    expect(() => validateRequest("plugin_catalog", pluginCatalog, manifest)).not.toThrow();
  });

  it("rejects wrong request permutations", () => {
    const missingRequired = fixture<ResourceRequestMap["catalog"]>("request", "request_catalog_missing_required_filter");
    const wrongType = fixture<ResourceRequestMap["catalog"]>("request", "request_catalog_wrong_filter_type");

    expect(() => validateRequest("catalog", missingRequired, manifest)).toThrow(ProtocolError);
    expect(() => validateRequest("catalog", wrongType, manifest)).toThrow(ProtocolError);
  });
});

describe("response parity", () => {
  it("accepts valid response fixtures", () => {
    const catalog = fixture<ResourceResponseMap["catalog"]>("response", "response_catalog_valid");
    const meta = fixture<ResourceResponseMap["meta"]>("response", "response_meta_valid");
    const subtitles = fixture<ResourceResponseMap["subtitles"]>("response", "response_subtitles_valid");
    const pluginCatalog = fixture<ResourceResponseMap["plugin_catalog"]>("response", "response_plugin_catalog_valid");

    expect(() => validateResponse("catalog", catalog)).not.toThrow();
    expect(() => validateResponse("meta", meta)).not.toThrow();
    expect(() => validateResponse("subtitles", subtitles)).not.toThrow();
    expect(() => validateResponse("plugin_catalog", pluginCatalog)).not.toThrow();
  });

  it("accepts every stream delivery fixture and unknown key fixture", () => {
    const fixtures = [
      "response_streams_direct",
      "response_streams_youtube",
      "response_streams_torrent",
      "response_streams_nzb",
      "response_streams_external",
      "response_streams_unknown_key",
    ] as const;

    for (const fixtureName of fixtures) {
      const streams = fixture<ResourceResponseMap["stream"]>("response", fixtureName);
      expect(() => validateResponse("stream", streams)).not.toThrow();
    }
  });
});

describe("schema parser limits", () => {
  it("parses valid fixture and rejects oversize/deep payload", () => {
    const manifest = readFileSync(path.join(fixturesRoot, "manifest", "manifest_valid.json"));
    expect(() => parseJsonWithLimits(manifest)).not.toThrow();

    expect(() => parseJsonWithLimits(manifest, { maxPayloadBytes: manifest.byteLength - 1 })).toThrow(ProtocolError);

    const deep = `${"[".repeat(70)}0${"]".repeat(70)}`;
    expect(() => parseJsonWithLimits(deep, { maxDepth: 64 })).toThrow(ProtocolError);
  });
});
