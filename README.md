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
            transport: { kind: "http", url: "https://cdn.example.com/movie.mp4", mode: "stream" },
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

console.log(server.url);       // manifest URL
console.log(server.installURL); // install deeplink
console.log(server.launchURL);  // launch URL
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

## Docs

- [Plugin Contract](./docs/plugin-contract.md)
- [Runtime + Serve Options](./docs/runtime-options.md)
- [Install + Settings](./docs/install-settings.md)

## Advanced API

```ts
import {
  createPlugin,
  validateManifest,
  validateRequest,
  validateResponse,
  ProtocolError,
} from "@streamfox/plugin-sdk";
```

Subpath export is also available:

```ts
import { validateManifest, validateRequest, validateResponse } from "@streamfox/plugin-sdk/advanced";
```

## Development

```bash
npm install
npm run build
npm test
```
