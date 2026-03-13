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
import { definePlugin, serve } from "@streamfox/plugin-sdk";

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

- `/catalog/movie/popular?genre=Action&year=2024&locale=el-GR&page=0&pageSize=20&sortKey=popularity&sortDirection=desc`
- `/meta/movie/tt0133093?locale=el-GR&regionCode=GR`
- `/stream/movie/tt0133093?videoID=trailer&startPositionSeconds=123&networkProfile=wifi`
- `/subtitles/movie/tt0133093?videoHash=abc123&videoSize=1234567&filename=matrix.mkv&languagePreferences=en,el`
- `/plugin_catalog/featured/catalog?page=0&experimental=streamfox:beta`

Legacy structured query params such as `request`, `schemaVersion`, `context`, `experimental`, `filters`, `sort`, `playback`, and `videoFingerprint` are rejected on GET resource routes.

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
