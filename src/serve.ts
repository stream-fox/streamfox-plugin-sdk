import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer as createHttpsServer, type ServerOptions as HttpsServerOptions } from "node:https";
import { serve as nodeServe } from "@hono/node-server";
import { ProtocolError } from "./errors";
import type { MediaPlugin } from "./plugin";
import { createServer, type CreateServerOptions } from "./create-server";
import type { SettingPrimitive } from "./install";

export interface TlsOptions {
  keyPath?: string;
  certPath?: string;
  caPath?: string;
  key?: string | Buffer;
  cert?: string | Buffer;
  ca?: string | Buffer;
  passphrase?: string;
}

export interface IntegrationOptions {
  installScheme?: string;
  launchBaseURL?: string;
  autoOpen?: "none" | "install" | "launch";
  openURL?: (url: string) => void | Promise<void>;
}

export interface ServeOptions extends CreateServerOptions {
  port?: number;
  hostname?: string;
  protocol?: "http" | "https";
  tls?: TlsOptions;
  integration?: IntegrationOptions;
}

export interface ServeResult {
  app: ReturnType<typeof createServer>;
  server: ReturnType<typeof nodeServe>;
  url: string;
  installURL: string;
  launchURL: string;
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

function normalizeBasePath(pathValue: string | undefined): string {
  if (!pathValue || pathValue === "/") {
    return "";
  }

  const withLeadingSlash = pathValue.startsWith("/") ? pathValue : `/${pathValue}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function buildLaunchURL(baseURL: string, manifestURL: string): string {
  const separator = baseURL.includes("?") ? "&" : "?";
  return `${baseURL}${separator}addonOpen=${encodeURIComponent(manifestURL)}`;
}

function spawnOpen(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function openURLWithSystem(url: string): Promise<void> {
  if (process.platform === "darwin") {
    await spawnOpen("open", [url]);
    return;
  }

  if (process.platform === "win32") {
    await spawnOpen("cmd", ["/c", "start", "", url]);
    return;
  }

  await spawnOpen("xdg-open", [url]);
}

export async function serve<TSettings extends Record<string, SettingPrimitive>>(
  plugin: MediaPlugin<TSettings>,
  options: ServeOptions = {},
): Promise<ServeResult> {
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

  if (!server.listening) {
    await once(server, "listening");
  }

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  const scheme = wantsHttps ? "https" : "http";
  const normalizedBasePath = normalizeBasePath(options.basePath);

  const manifestURL = `${scheme}://${hostname}:${resolvedPort}${normalizedBasePath}/manifest`;

  const integration = options.integration ?? {};
  const installScheme = integration.installScheme ?? "streamfox";
  const launchBaseURL = integration.launchBaseURL ?? "https://streamfox.app/#";

  const installURL = `${installScheme}://${hostname}:${resolvedPort}${normalizedBasePath}/manifest`;
  const launchURL = buildLaunchURL(launchBaseURL, manifestURL);

  const openTarget = integration.autoOpen ?? "none";
  const openTargetURL =
    openTarget === "install"
      ? installURL
      : openTarget === "launch"
        ? launchURL
        : undefined;

  if (openTargetURL) {
    const openURL = integration.openURL ?? openURLWithSystem;
    await openURL(openTargetURL);
  }

  return {
    app,
    server,
    url: manifestURL,
    installURL,
    launchURL,
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
