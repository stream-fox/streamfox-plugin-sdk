# StreamFox Plugin SDK

`@streamfox/plugin-sdk` is the Node.js SDK for StreamFox remote plugins.

It includes:

- declarative plugin contract with `definePlugin(...)`
- runtime server with `createServer(...)` / `serve(...)`
- strict schema-major validation (`schemaVersion.major === 1`)
- built-in installer UI and typed settings parsing
- canonical contract parity with `swift-media-plugin-kit`

## Install

```bash
npm i @streamfox/plugin-sdk
```

## Quick Start

```ts
import { definePlugin, filters, sorts, serve } from "@streamfox/plugin-sdk";

const plugin = definePlugin({
  plugin: {
    id: "com.example.demo",
    name: "Demo",
    version: "0.1.0",
  },
  resources: {
    stream: {
      mediaTypes: ["movie"],
      supportedTransports: ["http", "torrent", "youtube"],
      handler: async () => ({
        streams: [
          {
            transport: {
              kind: "http",
              url: "https://cdn.example.com/movie.mp4",
              mode: "stream",
            },
          },
        ],
      }),
    },
  },
});

const server = await serve(plugin, {
  port: 7000,
  integration: {
    installScheme: "streamfox",
    launchBaseURL: "https://streamfox.app/#",
    autoOpen: "none",
  },
});

console.log(server.url); // manifest URL
console.log(server.installURL); // install deeplink
console.log(server.launchURL); // launch URL
```

## Validation Lifecycle

Validation runs automatically in three phases:

1. `createPlugin(...)` / `definePlugin(...)`: manifest + capability shape validation.
2. Incoming request handling (`createServer` routes): request validation against manifest capabilities.
3. Outgoing handler responses: response validation before JSON emission.

Redirect responses are validated too (`redirect.url`, `redirect.status`) before the redirect is returned.

## Canonical Routes

- `GET /manifest`
- `GET /studio-config`
- `GET /catalog/:mediaType/:catalogID`
- `GET /meta/:mediaType/:itemID`
- `GET /stream/:mediaType/:itemID`
- `GET /subtitles/:mediaType/:itemID`
- `GET /plugin_catalog/:catalogID/:pluginKind`

## GET Query Style

Resource routes use one HTTP style:

- path params for identity
- plain query aliases for request shaping

Examples:

- `/catalog/movie/browse?genre=action&year=2024&locale=el-GR&page=0&pageSize=20&orderBy=popular`
- `/catalog/movie/browse?orderBy=rating&order=asc`
- `/meta/movie/tt0133093?locale=el-GR&regionCode=GR`
- `/stream/movie/tt0133093?videoID=trailer&startPositionSeconds=123&networkProfile=wifi`
- `/subtitles/movie/tt0133093?videoHash=abc123&videoSize=1234567&filename=matrix.mkv&languagePreferences=en,el`
- `/plugin_catalog/featured/catalog?page=0&experimental=streamfox:beta`

Legacy structured query params such as `request`, `schemaVersion`, `context`, `experimental`, `filters`, `sort`, `playback`, and `videoFingerprint` are rejected on GET resource routes.

## Catalog Filter Ergonomics

Catalog filters support:

- reusable `filterSets` shared across endpoints
- reusable `sortSets` shared across endpoints
- richer filter metadata for UI and docs
- richer sort metadata for UI and docs
- `filters.*` and `sorts.*` helpers for authoring plain manifest-compatible specs
- query alias normalization through `options[].aliases`
- ordering aliases through `orderBy`

Example:

```ts
import { definePlugin, filters, sorts } from "@streamfox/plugin-sdk";

const plugin = definePlugin({
  plugin: {
    id: "com.example.catalog",
    name: "Catalog Demo",
    version: "0.1.0",
  },
  resources: {
    catalog: {
      filterSets: {
        commonCatalogFilters: [
          filters.select("language", {
            label: "Language",
            group: "regional",
            options: [
              { label: "Japanese", value: "ja", aliases: ["Japanese (ja)"] },
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
      sortSets: {
        browseSorts: [
          sorts.desc("popularity", {
            label: "Popular",
            aliases: ["popular"],
          }),
          sorts.choice("rating", {
            label: "Top Rated",
            aliases: ["top-rated"],
            directions: ["descending", "ascending"],
            defaultDirection: "descending",
          }),
        ],
      },
      endpoints: [
        {
          id: "browse",
          name: "Browse",
          mediaTypes: ["movie"],
          filterSetRefs: ["commonCatalogFilters"],
          sortSetRefs: ["browseSorts"],
          filters: [filters.range("year")],
        },
      ],
      handler: async () => ({ items: [] }),
    },
  },
});
```

Prefer semantic endpoint IDs such as `browse`, `discover`, and `search`. Keep variable controls in the query string:

- `/catalog/movie/browse?language=ja`
- `/catalog/movie/browse?year=2024`
- `/catalog/movie/browse?query=matrix`
- `/catalog/movie/browse?orderBy=popular`

## Custom Frontends

There are two supported ways to own the installer/frontend experience:

1. Headless mode:

```ts
await serve(plugin, {
  frontend: false,
});
```

Use your own app against `GET /manifest`, `GET /studio-config`, and the resource routes.

2. Custom static bundle served by the SDK:

```ts
await serve(plugin, {
  frontend: {
    mountPath: "/installer",
    distPath: "/absolute/path/to/frontend-dist",
    assetsMountPath: "/installer/assets",
  },
});
```

`/studio-config` is the frontend contract for installer metadata, field definitions, deeplink scheme, and `configurationRequired`.

## Docs

- [Plugin Contract](./docs/plugin-contract.md)
- [Runtime + Serve Options](./docs/runtime-options.md)
- [Install + Settings](./docs/install-settings.md)

## Advanced API

```ts
import {
  createPlugin,
  parseJsonWithLimits,
  maximumJsonNestingDepth,
  validateManifest,
  validateRequest,
  validateResponse,
  ProtocolError,
} from "@streamfox/plugin-sdk";
```

JSON payload size/depth limit controls live in the schema utilities above, not in `createServer(...)` or `serve(...)`.

Subpath export is also available:

```ts
import {
  validateManifest,
  validateRequest,
  validateResponse,
} from "@streamfox/plugin-sdk/advanced";
```

## Development

```bash
npm install
npm run format
npm run build
npm test
```
