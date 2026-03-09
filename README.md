# StreamHub Node Media Plugin SDK

`@streamhub/media-plugin-sdk` is the canonical package for building StreamHub-compatible plugins in Node.js (JS + TS).

It provides:

- `definePlugin(...)` for a low-boilerplate plugin definition flow.
- Built-in HTTP hosting (`createServer`, `serve`) with schema-v2 validation.
- Built-in installer UI (Stremio-style install/config page).
- Typed settings field DSL (`settings.text`, `settings.password`, `settings.number`, `settings.checkbox`, `settings.select`, `settings.multiSelect`, `settings.textarea`).
- Strict protocol validation aligned with `swift-media-plugin-kit`.

## Install

```bash
npm i @streamhub/media-plugin-sdk
```

## 5-Minute TypeScript Plugin

```ts
import { definePlugin, serve, settings } from "@streamhub/media-plugin-sdk";

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
console.log("Installer:", url.replace("/manifest.json", "/"));
```

## 5-Minute JavaScript Plugin

```js
import { definePlugin, serve, settings } from "@streamhub/media-plugin-sdk";

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

## Request Endpoints

- `GET /manifest.json`
- `GET /studio-config.json`
- `POST /catalog`
- `POST /meta`
- `POST /stream`
- `POST /subtitles`
- `POST /plugin_catalog`

All POST bodies are validated against schema v2 contracts.

## Settings Behavior

Installer/settings values are read from request query params and parsed before handlers run.

- Query key uses `field.queryParam` if provided, else `field.key`.
- Missing values use field `defaultValue` when provided.
- `required: true` fields return `400 REQUEST_INVALID` when absent.
- Number/select/boolean fields are type-validated before handler execution.
- `multiSelect` fields are parsed as string arrays (supports repeated query keys and comma-separated values).

In handlers, read values from `context.settings`.

## HTTPS + Deeplink

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

## Migration (Old API -> New API)

- Old: `createPlugin({ manifest, handlers })`
- New primary: `definePlugin({ plugin, resources, install })`

You can still use `createPlugin` directly for advanced/manual manifest workflows.

## Advanced APIs

Use these when you need low-level control:

```ts
import {
  createPlugin,
  validateManifest,
  validateRequest,
  validateResponse,
  ProtocolError,
} from "@streamhub/media-plugin-sdk";
```

Or subpath export:

```ts
import { validateManifest, validateRequest, validateResponse } from "@streamhub/media-plugin-sdk/advanced";
```

## Local Development

```bash
npm install
npm run build
npm test
```

The CLI is maintained as a standalone package/repo (`create-media-plugin`).
