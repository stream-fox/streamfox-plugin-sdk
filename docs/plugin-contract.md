# Plugin Contract

## `definePlugin(options)`

```ts
definePlugin({
  plugin,
  resources,
  install?,
  schemaVersion?,
  experimental?,
})
```

### `plugin`

| Field         | Type                         | Required |
| ------------- | ---------------------------- | -------- |
| `id`          | `string`                     | yes      |
| `name`        | `string`                     | yes      |
| `version`     | `string` semver              | yes      |
| `description` | `string`                     | no       |
| `logo`        | `string` URL                 | no       |
| `author`      | `{ name, email?, website? }` | no       |
| `homepage`    | `string` URL                 | no       |

### `resources`

At least one resource is required.

#### `catalog`

```ts
{
  endpoints: CatalogEndpoint[];
  handler: PluginHandler<"catalog">;
}
```

`CatalogEndpoint`:

- `id: string`
- `name: string`
- `mediaTypes: MediaType[]`
- `filters?: Array<{ key, valueType, isRequired?, allowedValues? }>`
- `paging?: { defaultPageSize?, maxPageSize? }`
- `sorts?: Array<{ key, directions: ("ascending"|"descending")[] }>`

#### `meta`

```ts
{
  mediaTypes: MediaType[];
  includes?: ("videos"|"links"|"genres"|"cast"|"ratings")[];
  handler: PluginHandler<"meta">;
}
```

#### `stream`

```ts
{
  mediaTypes: MediaType[];
  supportedTransports: ("http"|"youtube"|"torrent"|"usenet"|"archive")[];
  handler: PluginHandler<"stream">;
}
```

#### `subtitles`

```ts
{
  mediaTypes: MediaType[];
  supportsHashLookup?: boolean;
  defaultLanguages?: string[];
  handler: PluginHandler<"subtitles">;
}
```

#### `pluginCatalog`

```ts
{
  endpoints: PluginCatalogEndpoint[];
  handler: PluginHandler<"plugin_catalog">;
}
```

`PluginCatalogEndpoint`:

- `id: string`
- `name: string`
- `pluginKinds: ("catalog"|"meta"|"stream"|"subtitles"|"plugin_catalog")[]`
- `tags?: string[]`
- `paging?: { defaultPageSize?, maxPageSize? }`

## Unified Stream Model

`StreamSource`:

- `transport: StreamTransport`
- `selection?: { fileIndex?: number; fileMustInclude?: string }`
- `name?: string`
- `description?: string`
- `subtitles?: SubtitleTrack[]`
- `hints?: StreamHints`

`StreamTransport` variants:

- `{ kind: "http", url: string, mode?: "stream" | "external" }`
- `{ kind: "youtube", id: string }`
- `{ kind: "torrent", infoHash: string, peerDiscovery?: string[] }`
- `{ kind: "usenet", nzbURL: string, servers?: string[] }`
- `{ kind: "archive", format: "rar"|"zip"|"7zip"|"tar"|"tgz", files: Array<{ url: string, bytes?: number }> }`

`StreamHints`:

- `countryWhitelist?: string[]`
- `bingeGroup?: string`
- `filename?: string`
- `videoSize?: number`
- `notWebReady?: boolean`
- `proxyHeaders?: { request?: Record<string,string>; response?: Record<string,string> }`
- `videoHash?: string`

Validation rule: `proxyHeaders` requires `notWebReady: true`.

## Meta Response Extensions

`MediaDetail` supports:

- `defaultVideoID?: string`
- `trailers?: StreamSource[]`
- `videos?: Array<VideoUnit>` where each `VideoUnit` also supports `trailers?: StreamSource[]`

Validation rule: if `videos` is non-empty and `defaultVideoID` is set, it must match one `videos[].id`.

## Plugin Catalog Extensions

`PluginCard` supports:

- `distribution?: { transport: string; manifestURL: string }`
- `manifestSnapshot?: Record<string, unknown>`

## Redirect Responses

All response types can return:

```ts
redirect?: { url: string; status?: 302 | 307 }
```

Runtime behavior:

- when `redirect` exists, the server returns an HTTP redirect (default `307`)
- JSON payload emission is skipped for that request
