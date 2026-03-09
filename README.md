# StreamFox Plugin SDK

`@streamfox/plugin-sdk` is the Node.js SDK for building StreamFox-compatible media plugins.

It provides:

- `definePlugin(...)` for a compact plugin definition flow
- built-in HTTP hosting with `createServer(...)` and `serve(...)`
- schema-v1 request, manifest, and response validation
- installer UI and typed settings helpers
- a contract aligned with `swift-media-plugin-kit`

## Install

```bash
npm i @streamfox/plugin-sdk
```

## Quick Start

### TypeScript

```ts
import { definePlugin, serve, settings } from "@streamfox/plugin-sdk";

const plugin = definePlugin({
  plugin: {
    id: "org.example.demo-subtitles",
    name: "Demo Subtitles",
    version: "1.0.0",
    description: "Simple subtitles plugin",
  },
  install: {
    title: "Subtitle Settings",
    fields: [
      settings.text("languages", { defaultValue: "en,el", placeholder: "en,el" }),
      settings.checkbox("includeHI", { defaultValue: true }),
      settings.number("maxLinks", { defaultValue: 20, min: 1, max: 200 }),
    ],
  },
  resources: {
    subtitles: {
      mediaTypes: ["movie", "episode"],
      defaultLanguages: ["en"],
      handler: async (request, { settings }) => {
        const preferred =
          typeof settings.languages === "string"
            ? settings.languages.split(",").map((v) => v.trim()).filter(Boolean)
            : (request.languagePreferences ?? []);

        void preferred;
        void settings.includeHI;
        void settings.maxLinks;

        return {
          subtitles: [],
        };
      },
    },
  },
});

const { url } = await serve(plugin, { port: 7000 });
console.log("Manifest:", url);
console.log("Installer:", url.replace("/manifest", "/"));
```

### JavaScript

```js
import { definePlugin, serve, settings } from "@streamfox/plugin-sdk";

const plugin = definePlugin({
  plugin: {
    id: "org.example.demo-meta",
    name: "Demo Meta",
    version: "1.0.0",
  },
  install: {
    fields: [settings.password("token")],
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

await serve(plugin, { port: 7000 });
```

## HTTP Contract

- `GET /manifest`
- `GET /studio-config`
- `GET /catalog/:mediaType/:catalogID`
- `GET /meta/:mediaType/:itemID`
- `GET /stream/:mediaType/:itemID`
- `GET /subtitles/:mediaType/:itemID`
- `GET /plugin_catalog/:catalogID/:pluginKind`

All resource requests are validated against schema v1 contracts.

## Settings

Installer/settings values are read from request query params and parsed before handlers run.

- Query key uses `field.queryParam` if provided, else `field.key`.
- Missing values use field `defaultValue` when provided.
- `required: true` fields return `400 REQUEST_INVALID` when absent.
- Number/select/boolean fields are type-validated before handler execution.
- `multiSelect` fields are parsed as string arrays (supports repeated query keys and comma-separated values).

In handlers, read values from `context.settings`.

## HTTPS and Deeplinks

```ts
await serve(plugin, {
  protocol: "https",
  tls: {
    keyPath: "./certs/dev.key",
    certPath: "./certs/dev.crt",
  },
  deeplink: {
    enabled: true,
    scheme: "stremio",
  },
});
```

## Migration

- Old: `createPlugin({ manifest, handlers })`
- New primary: `definePlugin({ plugin, resources, install })`

You can still use `createPlugin` directly for advanced/manual manifest workflows.

## Advanced API

Use these when you need low-level control:

```ts
import {
  createPlugin,
  validateManifest,
  validateRequest,
  validateResponse,
  ProtocolError,
} from "@streamfox/plugin-sdk";
```

Or subpath export:

```ts
import { validateManifest, validateRequest, validateResponse } from "@streamfox/plugin-sdk/advanced";
```

## Development

```bash
npm install
npm run build
npm test
```

The companion scaffolder lives in `create-streamfox-plugin`.
