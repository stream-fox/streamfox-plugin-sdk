# Runtime + Serve Options

## `createServer(plugin, options)`

`CreateServerOptions`:

| Field             | Type                                                               | Default     | Notes                                     |
| ----------------- | ------------------------------------------------------------------ | ----------- | ----------------------------------------- |
| `basePath`        | `string`                                                           | `""`        | Prefix for all routes.                    |
| `enableCors`      | `boolean`                                                          | `true`      | Enables CORS middleware.                  |
| `maxPayloadBytes` | `number`                                                           | SDK default | Limit for JSON query payload parsing.     |
| `maxDepth`        | `number`                                                           | SDK default | Max JSON nesting depth.                   |
| `frontend`        | `boolean \| { enabled?, mountPath?, assetsMountPath?, distPath? }` | enabled     | Installer/static UI behavior.             |
| `deeplink`        | `{ enabled?, scheme?, manifestPath? }`                             | enabled     | Controls studio-config deeplink metadata. |
| `installer`       | `boolean \| InstallOptions`                                        | enabled     | Built-in installer settings.              |

`FrontendOptions`:

- `enabled?: boolean`
- `mountPath?: string`
- `assetsMountPath?: string`
- `distPath?: string`

## `serve(plugin, options)`

`serve` wraps `createServer` and starts an HTTP/HTTPS server.

`ServeOptions` extends `CreateServerOptions` with:

| Field         | Type                 | Default                            |
| ------------- | -------------------- | ---------------------------------- |
| `port`        | `number`             | `7000`                             |
| `hostname`    | `string`             | `127.0.0.1`                        |
| `protocol`    | `"http" \| "https"`  | auto (`http`, unless TLS provided) |
| `tls`         | `TlsOptions`         | none                               |
| `integration` | `IntegrationOptions` | defaults below                     |

`TlsOptions`:

- file paths: `keyPath`, `certPath`, `caPath`
- inline buffers/strings: `key`, `cert`, `ca`
- optional `passphrase`

`IntegrationOptions`:

| Field           | Type                                     | Default                   |
| --------------- | ---------------------------------------- | ------------------------- |
| `installScheme` | `string`                                 | `streamfox`               |
| `launchBaseURL` | `string`                                 | `https://streamfox.app/#` |
| `autoOpen`      | `"none" \| "install" \| "launch"`        | `none`                    |
| `openURL`       | `(url: string) => void \| Promise<void>` | system opener             |

## `ServeResult`

`serve(...)` returns:

- `url`: manifest URL
- `installURL`: install deeplink (`<installScheme>://.../manifest`)
- `launchURL`: launch URL (`launchBaseURL + addonOpen=<manifestURL>`)
- `app`, `server`, `close()`

## Custom Frontend Patterns

Headless mode:

```ts
await serve(plugin, {
  frontend: false,
});
```

This keeps the plugin API active while letting you host your own frontend elsewhere. Your frontend should consume:

- `GET /manifest`
- `GET /studio-config`
- the canonical resource routes

Custom static bundle served by the SDK:

```ts
await serve(plugin, {
  frontend: {
    mountPath: "/installer",
    distPath: "/absolute/path/to/frontend-dist",
    assetsMountPath: "/installer/assets",
  },
});
```

Notes:

- `mountPath` controls where `index.html` is served.
- `assetsMountPath` controls where files from `<distPath>/assets` are served.
- If your bundler emits absolute asset URLs like `/assets/...`, set `assetsMountPath: "/assets"`.
- `/studio-config` is the canonical frontend configuration endpoint for installer labels, field schemas, deeplink config, and `configurationRequired`.

## Request Mapping Inputs

Routes are canonical; query params can provide extra data.

Common query payload keys:

- `schemaVersion` (JSON object)
- `context` (JSON object)
- `experimental` (JSON array)
- `request` (full JSON request override; path params still win for canonical identifiers)

Catalog-specific:

- `query`
- `filters` (JSON array)
- `sort` (JSON object) or `sortKey` + `sortDirection`
- `page` (JSON object) or `pageIndex` + `pageSize`

Stream-specific:

- `videoID`
- `playback` (JSON object)

Subtitles-specific:

- `videoFingerprint` (JSON object)
- `languagePreferences` (repeated keys and comma-separated both supported)

Plugin catalog-specific:

- `query`
- `page` or `pageIndex` + `pageSize`
