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
  filterSets?: Record<string, FilterSpec[]>;
  sortSets?: Record<string, SortSpec[]>;
  endpoints: CatalogEndpoint[];
  handler: PluginHandler<"catalog">;
}
```

`CatalogEndpoint`:

- `id: string`
- `name: string`
- `mediaTypes: MediaType[]`
- `filterSetRefs?: string[]`
- `sortSetRefs?: string[]`
- `filters?: FilterSpec[]`
- `paging?: { defaultPageSize?, maxPageSize? }`
- `sorts?: SortSpec[]`

`FilterSpec`:

- `key: string`
- `valueType: "string" | "int" | "bool" | "stringList" | "intRange" | "intOrRange"`
- `isRequired?: boolean`
- `label?: string`
- `description?: string`
- `placeholder?: string`
- `group?: string`
- `control?: "select" | "multi_select" | "text" | "number" | "range" | "toggle"`
- `defaultValue?: string | number | boolean | string[] | { min?: number; max?: number }`
- `options?: Array<{ value: string; label: string; aliases?: string[] }>`
- `allowedValues?: string[]`

`allowedValues` is still decoded for compatibility, but `options` is the richer canonical model going forward.

Range-capable numeric filters use one logical key:

- `int`: exact only, for example `year=2024`
- `intRange`: range only, for example `year=2000..2024`
- `intOrRange`: exact or range on the same key

Helper builders are exported from the SDK:

- `filters.text(key, options?)`
- `filters.select(key, options)`
- `filters.multiSelect(key, options)`
- `filters.number(key, options?)`
- `filters.range(key, options?)`
- `filters.intOrRange(key, options?)`
- `filters.toggle(key, options?)`
- `sorts.choice(key, options?)`
- `sorts.asc(key, options?)`
- `sorts.desc(key, options?)`

`SortSpec`:

- `key: string`
- `label?: string`
- `description?: string`
- `group?: string`
- `aliases?: string[]`
- `directions: ("ascending"|"descending")[]`
- `defaultDirection?: "ascending"|"descending"`

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
