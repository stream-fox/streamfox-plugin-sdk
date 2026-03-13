# Runtime + Serve Options

## `createServer(plugin, options)`

`CreateServerOptions`:

| Field             | Type                                                               | Default     | Notes                                     |
| ----------------- | ------------------------------------------------------------------ | ----------- | ----------------------------------------- |
| `basePath`        | `string`                                                           | `""`        | Prefix for all routes.                    |
| `enableCors`      | `boolean`                                                          | `true`      | Enables CORS middleware.                  |
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

`createServer(...)` no longer exposes JSON payload size/depth options for GET resource request parsing. If you need JSON payload limit utilities, use the schema helpers exported by the SDK (`parseJsonWithLimits`, `JsonParseLimits`, `maximumJsonNestingDepth`).

Common query payload keys:

- `schemaMajor` + `schemaMinor`
- `locale`
- `regionCode`
- `traceID`
- `experimental` using repeated keys or comma-separated `namespace:key[:value]` tokens

Catalog-specific:

- `query`
- declared filter aliases, such as `genre=Action`, `year=2024`, `language=el`
- `sortKey` + `sortDirection`
- `page` + `pageSize`
- `pageIndex` + `pageSize`

Stream-specific:

- `videoID`
- `startPositionSeconds`
- `networkProfile`

Subtitles-specific:

- `videoHash`
- `videoSize`
- `filename`
- `languagePreferences` (repeated keys and comma-separated both supported)

Plugin catalog-specific:

- `query`
- `page` + `pageSize`
- `pageIndex` + `pageSize`

Legacy structured request params such as `request`, `schemaVersion`, `context`, `experimental`, `filters`, `sort`, `playback`, and `videoFingerprint` are not accepted on GET resource routes. The SDK uses one HTTP style now: canonical path params plus plain query aliases.

Examples:

- `/catalog/movie/popular?genre=Action&year=2024&locale=el-GR&page=0&pageSize=20&sortKey=popularity&sortDirection=desc`
- `/meta/movie/tt0133093?locale=el-GR&regionCode=GR`
- `/stream/movie/tt0133093?videoID=trailer&startPositionSeconds=123&networkProfile=wifi`
- `/subtitles/movie/tt0133093?videoHash=abc123&videoSize=1234567&filename=matrix.mkv&languagePreferences=en,el`
- `/plugin_catalog/featured/catalog?page=0&experimental=streamfox:beta`
