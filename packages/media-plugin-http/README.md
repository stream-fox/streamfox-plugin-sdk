# @streamhub/media-plugin-http

HTTP server adapter for StreamHub media plugins powered by Hono.

## API

- `createServer(plugin, options)`
- `serve(plugin, options)`

## HTTPS

`serve` supports HTTPS when `protocol: "https"` and TLS material is provided:

```ts
await serve(plugin, {
  protocol: "https",
  tls: {
    keyPath: "./certs/dev.key",
    certPath: "./certs/dev.crt",
  },
});
```

## Install Deeplink

The built-in frontend serves an `Install Addon` deep link button (default `stremio://`).

You can customize it with:

```ts
createServer(plugin, {
  deeplink: {
    scheme: "stremio",
    enabled: true,
  },
});
```
