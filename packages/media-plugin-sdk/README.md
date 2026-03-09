# @streamhub/media-plugin-sdk

Canonical Node SDK for StreamHub plugins.

## Primary API

- `definePlugin({ plugin, resources, install })`
- `createServer(plugin, options)`
- `serve(plugin, options)`
- `settings.text/password/number/checkbox/select/multiSelect/textarea`

## Advanced API

- `createPlugin({ manifest, handlers })`
- `validateManifest(manifest)`
- `validateRequest(resource, request, manifest)`
- `validateResponse(resource, response)`
- `ProtocolError`

## Install

```bash
npm i @streamhub/media-plugin-sdk
```

## Example

```ts
import { definePlugin, serve, settings } from "@streamhub/media-plugin-sdk";

const plugin = definePlugin({
  plugin: { id: "org.example.demo", name: "Demo", version: "1.0.0" },
  install: {
    fields: [settings.text("languages", { defaultValue: "en" })],
  },
  resources: {
    subtitles: {
      mediaTypes: ["movie"],
      handler: async (_request, { settings }) => {
        void settings.languages;
        return { subtitles: [] };
      },
    },
  },
});

await serve(plugin, { port: 7000 });
```
