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

const fixturesRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
);

function fixture<T>(
  group: "manifest" | "request" | "response",
  name: string,
): T {
  const data = readFileSync(
    path.join(fixturesRoot, group, `${name}.json`),
    "utf8",
  );
  return JSON.parse(data) as T;
}

describe("manifest parity", () => {
  it("accepts valid manifests", () => {
    const valid = fixture<Manifest>("manifest", "manifest_valid");
    const withExperimental = fixture<Manifest>(
      "manifest",
      "manifest_with_experimental",
    );

    expect(() => validateManifest(valid)).not.toThrow();
    expect(() => validateManifest(withExperimental)).not.toThrow();
  });

  it("rejects invalid schema and semver", () => {
    const invalidSchema = fixture<Manifest>(
      "manifest",
      "manifest_invalid_schema_major",
    );
    const invalidSemver = fixture<Manifest>(
      "manifest",
      "manifest_invalid_semver",
    );

    expect(() => validateManifest(invalidSchema)).toThrow(ProtocolError);
    expect(() => validateManifest(invalidSemver)).toThrow(ProtocolError);
  });

  it("allows unknown keys and rejects duplicate capabilities", () => {
    const unknownTop = fixture<Manifest>(
      "manifest",
      "manifest_unknown_top_level",
    );
    const unknownCapability = fixture<Manifest>(
      "manifest",
      "manifest_unknown_capability_key",
    );
    const duplicate = fixture<Manifest>(
      "manifest",
      "manifest_duplicate_capability",
    );

    expect(() => validateManifest(unknownTop)).not.toThrow();
    expect(() => validateManifest(unknownCapability)).not.toThrow();
    expect(() => validateManifest(duplicate)).toThrow(ProtocolError);
  });
});

describe("request parity", () => {
  const manifest = validateManifest(
    fixture<Manifest>("manifest", "manifest_valid"),
  );

  it("accepts all valid request fixtures", () => {
    const catalog = fixture<ResourceRequestMap["catalog"]>(
      "request",
      "request_catalog_valid",
    );
    const meta = fixture<ResourceRequestMap["meta"]>(
      "request",
      "request_meta_valid",
    );
    const stream = fixture<ResourceRequestMap["stream"]>(
      "request",
      "request_stream_valid",
    );
    const subtitles = fixture<ResourceRequestMap["subtitles"]>(
      "request",
      "request_subtitles_valid",
    );
    const pluginCatalog = fixture<ResourceRequestMap["plugin_catalog"]>(
      "request",
      "request_plugin_catalog_valid",
    );

    expect(() => validateRequest("catalog", catalog, manifest)).not.toThrow();
    expect(() => validateRequest("meta", meta, manifest)).not.toThrow();
    expect(() => validateRequest("stream", stream, manifest)).not.toThrow();
    expect(() =>
      validateRequest("subtitles", subtitles, manifest),
    ).not.toThrow();
    expect(() =>
      validateRequest("plugin_catalog", pluginCatalog, manifest),
    ).not.toThrow();
  });

  it("rejects wrong request permutations", () => {
    const missingRequired = fixture<ResourceRequestMap["catalog"]>(
      "request",
      "request_catalog_missing_required_filter",
    );
    const wrongType = fixture<ResourceRequestMap["catalog"]>(
      "request",
      "request_catalog_wrong_filter_type",
    );

    expect(() => validateRequest("catalog", missingRequired, manifest)).toThrow(
      ProtocolError,
    );
    expect(() => validateRequest("catalog", wrongType, manifest)).toThrow(
      ProtocolError,
    );
  });

  it("accepts exact and range request values for intOrRange filters", () => {
    const exactOrRangeManifest = validateManifest({
      ...fixture<Manifest>("manifest", "manifest_valid"),
      capabilities: [
        {
          kind: "catalog",
          endpoints: [
            {
              id: "browse",
              name: "Browse",
              mediaTypes: ["movie"],
              filters: [
                { key: "year", valueType: "intOrRange", isRequired: true },
              ],
            },
          ],
        },
      ],
    });

    expect(() =>
      validateRequest(
        "catalog",
        {
          schemaVersion: { major: 1, minor: 0 },
          catalogID: "browse",
          mediaType: "movie",
          filters: [{ key: "year", value: { kind: "int", int: 2024 } }],
        },
        exactOrRangeManifest,
      ),
    ).not.toThrow();

    expect(() =>
      validateRequest(
        "catalog",
        {
          schemaVersion: { major: 1, minor: 0 },
          catalogID: "browse",
          mediaType: "movie",
          filters: [
            {
              key: "year",
              value: { kind: "intRange", intRange: { min: 2000, max: 2024 } },
            },
          ],
        },
        exactOrRangeManifest,
      ),
    ).not.toThrow();
  });

  it("keeps intRange filters range-only during request validation", () => {
    expect(() =>
      validateRequest(
        "catalog",
        {
          schemaVersion: { major: 1, minor: 0 },
          catalogID: "top",
          mediaType: "movie",
          filters: [{ key: "year", value: { kind: "int", int: 2024 } }],
        },
        manifest,
      ),
    ).toThrow(ProtocolError);
  });
});

describe("response parity", () => {
  it("accepts valid response fixtures", () => {
    const catalog = fixture<ResourceResponseMap["catalog"]>(
      "response",
      "response_catalog_valid",
    );
    const meta = fixture<ResourceResponseMap["meta"]>(
      "response",
      "response_meta_valid",
    );
    const subtitles = fixture<ResourceResponseMap["subtitles"]>(
      "response",
      "response_subtitles_valid",
    );
    const pluginCatalog = fixture<ResourceResponseMap["plugin_catalog"]>(
      "response",
      "response_plugin_catalog_valid",
    );

    expect(() => validateResponse("catalog", catalog)).not.toThrow();
    expect(() => validateResponse("meta", meta)).not.toThrow();
    expect(() => validateResponse("subtitles", subtitles)).not.toThrow();
    expect(() =>
      validateResponse("plugin_catalog", pluginCatalog),
    ).not.toThrow();
  });

  it("accepts every stream delivery fixture and unknown key fixture", () => {
    const fixtures = [
      "response_streams_direct",
      "response_streams_youtube",
      "response_streams_torrent",
      "response_streams_nzb",
      "response_streams_archive",
      "response_streams_external",
      "response_streams_unknown_key",
    ] as const;

    for (const fixtureName of fixtures) {
      const streams = fixture<ResourceResponseMap["stream"]>(
        "response",
        fixtureName,
      );
      expect(() => validateResponse("stream", streams)).not.toThrow();
    }
  });

  it("rejects proxyHeaders when notWebReady is missing", () => {
    const invalid = fixture<ResourceResponseMap["stream"]>(
      "response",
      "response_streams_direct",
    );
    invalid.streams = [
      {
        transport: { kind: "http", url: "https://cdn.example.com/video.mp4" },
        hints: {
          proxyHeaders: {
            request: { "User-Agent": "StreamFox" },
          },
        },
      },
    ];

    expect(() => validateResponse("stream", invalid)).toThrow(ProtocolError);
  });

  it("rejects invalid defaultVideoID reference", () => {
    const invalid = fixture<ResourceResponseMap["meta"]>(
      "response",
      "response_meta_valid",
    );
    if (invalid.item) {
      invalid.item.defaultVideoID = "missing-video";
    }

    expect(() => validateResponse("meta", invalid)).toThrow(ProtocolError);
  });

  it("accepts and validates similarItems on meta responses", () => {
    const response = fixture<ResourceResponseMap["meta"]>(
      "response",
      "response_meta_valid",
    );

    if (response.item) {
      response.item.similarItems = [
        {
          id: "tt0000002",
          mediaType: "movie",
          title: "Big Buck Bunny 2",
        },
      ];
    }

    expect(() => validateResponse("meta", response)).not.toThrow();

    if (response.item?.similarItems?.[0]) {
      response.item.similarItems[0].title = "";
    }

    expect(() => validateResponse("meta", response)).toThrow(ProtocolError);
  });

  it("accepts rich media detail metadata and rejects invalid rich fields", () => {
    const response = fixture<ResourceResponseMap["meta"]>(
      "response",
      "response_meta_valid",
    );

    if (!response.item) {
      throw new Error("expected meta fixture item");
    }

    response.item.summary.logoURL = "https://cdn.example.com/logo.png";
    response.item.summary.releasedAt = "2024-01-10T00:00:00.000Z";
    response.item.summary.background = "https://cdn.example.com/background.png";
    response.item.summary.runtime = "90 min";
    response.item.summary.slug = "movie/big-buck-bunny";
    response.item.summary.imdbRating = 6.4;
    response.item.summary.popularity = 0.82;
    response.item.summary.sourceRatings = [
      { provider: "imdb", rating: 6.4 },
      { provider: "streamfox", rating: 6.8 },
    ];

    response.item.background = "https://cdn.example.com/background.png";
    response.item.releasedAt = "2024-01-10T00:00:00.000Z";
    response.item.dvdReleaseAt = "2024-02-10T00:00:00.000Z";
    response.item.logoURL = "https://cdn.example.com/logo.png";
    response.item.runtime = "90 min";
    response.item.language = "English";
    response.item.country = "Netherlands";
    response.item.awards = "Open movie showcase";
    response.item.slug = "movie/big-buck-bunny";
    response.item.imdbRating = 6.4;
    response.item.popularity = 0.82;
    response.item.popularityBySource = { streamfox: 0.82, imdb: 0.76 };
    response.item.sourceRatings = [
      { provider: "imdb", rating: 6.4 },
      { provider: "streamfox", rating: 6.8 },
    ];
    response.item.cast = [
      { name: "Big Buck Bunny", character: "Hero" },
      { name: "Narrator", role: "Voice" },
    ];
    response.item.directors = [{ name: "Sacha Goedegebure" }];
    response.item.writers = [{ name: "Sacha Goedegebure" }];
    response.item.behaviorHints = {
      defaultVideoId: "video-1",
      hasScheduledVideos: false,
    };
    response.item.defaultVideoID = "video-1";
    response.item.videos = [
      {
        id: "video-1",
        title: "Main video",
        releasedAt: "2024-01-10T00:00:00.000Z",
        firstAiredAt: "2024-01-10T00:00:00.000Z",
        rating: 6.4,
        streams: [],
      },
    ];

    expect(() => validateResponse("meta", response)).not.toThrow();

    response.item.popularity = -1;
    expect(() => validateResponse("meta", response)).toThrow(ProtocolError);
    response.item.popularity = 0.82;

    response.item.cast = [{ name: "" }];
    expect(() => validateResponse("meta", response)).toThrow(ProtocolError);
    response.item.cast = [{ name: "Big Buck Bunny", character: "Hero" }];

    response.item.sourceRatings = [{ provider: "", rating: 6.4 }];
    expect(() => validateResponse("meta", response)).toThrow(ProtocolError);
    response.item.sourceRatings = [{ provider: "imdb", rating: 6.4 }];

    response.item.behaviorHints = { defaultVideoId: "missing-video" };
    expect(() => validateResponse("meta", response)).toThrow(ProtocolError);
  });
});

describe("schema parser limits", () => {
  it("parses valid fixture and rejects oversize/deep payload", () => {
    const manifest = readFileSync(
      path.join(fixturesRoot, "manifest", "manifest_valid.json"),
    );
    expect(() => parseJsonWithLimits(manifest)).not.toThrow();

    expect(() =>
      parseJsonWithLimits(manifest, {
        maxPayloadBytes: manifest.byteLength - 1,
      }),
    ).toThrow(ProtocolError);

    const deep = `${"[".repeat(70)}0${"]".repeat(70)}`;
    expect(() => parseJsonWithLimits(deep, { maxDepth: 64 })).toThrow(
      ProtocolError,
    );
  });
});
