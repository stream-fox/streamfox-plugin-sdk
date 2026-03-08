import { readFileSync } from "node:fs";
import { createServer as createHttpsServer, type ServerOptions as HttpsServerOptions } from "node:https";
import { serve as nodeServe } from "@hono/node-server";
import { ProtocolError, type MediaPlugin } from "@streamhub/media-plugin-sdk";
import { createServer, type CreateServerOptions } from "./create-server";

export interface TlsOptions {
  keyPath?: string;
  certPath?: string;
  caPath?: string;
  key?: string | Buffer;
  cert?: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

export interface ServeOptions extends CreateServerOptions {
  port?: number;
  hostname?: string;
  protocol?: "http" | "https";
  tls?: TlsOptions;
}

export interface ServeResult {
  app: ReturnType<typeof createServer>;
  server: ReturnType<typeof nodeServe>;
  url: string;
  close: () => Promise<void>;
}

function resolveTlsBuffer(value: string | Buffer | undefined, pathValue: string | undefined): string | Buffer | undefined {
  if (value !== undefined) {
    return value;
  }

  if (pathValue) {
    return readFileSync(pathValue);
  }

  return undefined;
}

function resolveHttpsOptions(options: TlsOptions): HttpsServerOptions {
  const key = resolveTlsBuffer(options.key, options.keyPath);
  const cert = resolveTlsBuffer(options.cert, options.certPath);
  const ca = resolveTlsBuffer(options.ca, options.caPath);

  if (!key || !cert) {
    throw ProtocolError.internal(
      "HTTPS requires TLS key and cert. Provide tls.key/tls.cert or tls.keyPath/tls.certPath.",
    );
  }

  return {
    key,
    cert,
    ...(ca !== undefined ? { ca } : {}),
    ...(options.passphrase !== undefined ? { passphrase: options.passphrase } : {}),
  };
}

export async function serve(plugin: MediaPlugin, options: ServeOptions = {}): Promise<ServeResult> {
  const app = createServer(plugin, options);
  const port = options.port ?? 7000;
  const hostname = options.hostname ?? "127.0.0.1";

  const wantsHttps = options.protocol === "https" || options.tls !== undefined;

  const server = wantsHttps
    ? nodeServe({
        fetch: app.fetch,
        port,
        hostname,
        createServer: createHttpsServer,
        serverOptions: resolveHttpsOptions(options.tls ?? {}),
      })
    : nodeServe({
        fetch: app.fetch,
        port,
        hostname,
      });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const scheme = wantsHttps ? "https" : "http";

  return {
    app,
    server,
    url: `${scheme}://${hostname}:${resolvedPort}${options.basePath ?? ""}/manifest.json`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      }),
  };
}
