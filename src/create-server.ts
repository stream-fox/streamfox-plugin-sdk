import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { normalizeError, ProtocolError } from "./errors";
import { parseJsonWithLimits, type JsonParseLimits } from "./schema";
import type { AnySettingField, InstallOptions, SettingPrimitive } from "./install";
import { parseInstallSettings } from "./install";
import type { MediaPlugin } from "./plugin";
import { validateRequest, validateResponse } from "./validators";
import { SCHEMA_VERSION_CURRENT, type RequestPage, type RequestSort, type ResourceKind, type ResourceRequestMap } from "./types";
import { isRecord } from "./utils";

const TEXT_MIME_BY_EXTENSION: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

const resourcePaths: ResourceKind[] = ["catalog", "meta", "stream", "subtitles", "plugin_catalog"];

export interface FrontendOptions {
  enabled?: boolean;
  mountPath?: string;
  distPath?: string;
}

export interface DeepLinkOptions {
  enabled?: boolean;
  scheme?: string;
  manifestPath?: string;
}

export interface CreateServerOptions {
  basePath?: string;
  enableCors?: boolean;
  maxPayloadBytes?: number;
  maxDepth?: number;
  frontend?: FrontendOptions | boolean;
  deeplink?: DeepLinkOptions;
  installer?: InstallOptions | boolean;
}

interface NormalizedInstaller {
  enabled: boolean;
  title: string;
  subtitle: string;
  description: string;
  installButtonText: string;
  openManifestButtonText: string;
  copyManifestButtonText: string;
  fields: readonly AnySettingField[];
}

function normalizePathPrefix(value: string | undefined): string {
  if (!value || value === "/") {
    return "";
  }

  const withLeadingSlash = value.startsWith("/") ? value : `/${value}`;
  return withLeadingSlash.endsWith("/") ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
}

function buildParseLimits(options: CreateServerOptions, traceId?: string): JsonParseLimits {
  return {
    ...(options.maxPayloadBytes !== undefined ? { maxPayloadBytes: options.maxPayloadBytes } : {}),
    ...(options.maxDepth !== undefined ? { maxDepth: options.maxDepth } : {}),
    ...(traceId !== undefined ? { traceId } : {}),
  };
}

function parseOptionalString(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function parseIntegerQueryValue(value: string | null, key: string, traceId?: string): number | undefined {
  if (value === null || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw ProtocolError.requestInvalid(`query parameter '${key}' must be an integer`, { key, value }, traceId);
  }

  return parsed;
}

function parseJsonQueryParam<T>(
  searchParams: URLSearchParams,
  key: string,
  options: CreateServerOptions,
  traceId?: string,
): T | undefined {
  const raw = searchParams.get(key);
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }

  return parseJsonWithLimits<T>(raw, buildParseLimits(options, traceId));
}

function parseStringListQuery(searchParams: URLSearchParams, key: string): string[] | undefined {
  const values = searchParams
    .getAll(key)
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return values.length > 0 ? values : undefined;
}

function parseSchemaVersionFromQuery(
  searchParams: URLSearchParams,
  options: CreateServerOptions,
  traceId?: string,
): { major: number; minor: number } {
  const explicit = parseJsonQueryParam<unknown>(searchParams, "schemaVersion", options, traceId);
  if (explicit !== undefined) {
    if (!isRecord(explicit)) {
      throw ProtocolError.requestInvalid("query parameter 'schemaVersion' must be a JSON object", { schemaVersion: explicit }, traceId);
    }

    const major = explicit.major;
    const minor = explicit.minor;
    if (
      typeof major !== "number" ||
      !Number.isInteger(major) ||
      major < 0 ||
      typeof minor !== "number" ||
      !Number.isInteger(minor) ||
      minor < 0
    ) {
      throw ProtocolError.requestInvalid(
        "query parameter 'schemaVersion' must include non-negative integer major and minor fields",
        { schemaVersion: explicit },
        traceId,
      );
    }

    return {
      major,
      minor,
    };
  }

  const major = parseIntegerQueryValue(searchParams.get("schemaMajor"), "schemaMajor", traceId);
  const minor = parseIntegerQueryValue(searchParams.get("schemaMinor"), "schemaMinor", traceId);

  if ((major !== undefined && major < 0) || (minor !== undefined && minor < 0)) {
    throw ProtocolError.requestInvalid(
      "query parameters 'schemaMajor' and 'schemaMinor' must be non-negative integers",
      { schemaMajor: major, schemaMinor: minor },
      traceId,
    );
  }

  if (major === undefined && minor === undefined) {
    return { ...SCHEMA_VERSION_CURRENT };
  }

  return {
    major: major ?? SCHEMA_VERSION_CURRENT.major,
    minor: minor ?? SCHEMA_VERSION_CURRENT.minor,
  };
}

function parsePageFromQuery(
  searchParams: URLSearchParams,
  options: CreateServerOptions,
  traceId?: string,
): RequestPage | undefined {
  const page = parseJsonQueryParam<RequestPage>(searchParams, "page", options, traceId);
  if (page) {
    return page;
  }

  const index = parseIntegerQueryValue(searchParams.get("pageIndex"), "pageIndex", traceId);
  const size = parseIntegerQueryValue(searchParams.get("pageSize"), "pageSize", traceId);
  if (index === undefined && size === undefined) {
    return undefined;
  }

  return {
    index: index ?? 0,
    ...(size !== undefined ? { size } : {}),
  };
}

function parseSortFromQuery(
  searchParams: URLSearchParams,
  options: CreateServerOptions,
  traceId?: string,
): RequestSort | undefined {
  const sort = parseJsonQueryParam<RequestSort>(searchParams, "sort", options, traceId);
  if (sort) {
    return sort;
  }

  const key = parseOptionalString(searchParams.get("sortKey"));
  const direction = parseOptionalString(searchParams.get("sortDirection"));
  if (!key && !direction) {
    return undefined;
  }

  return {
    key: key ?? "",
    direction: (direction ?? "ascending") as RequestSort["direction"],
  };
}

function parseRequestFromQuery<K extends ResourceKind>(
  resource: K,
  searchParams: URLSearchParams,
  options: CreateServerOptions,
  headerTraceId?: string,
): ResourceRequestMap[K] {
  const explicitRequest = parseOptionalString(searchParams.get("request"));
  if (explicitRequest) {
    const parsed = parseJsonWithLimits<unknown>(explicitRequest, buildParseLimits(options, headerTraceId));
    if (!isRecord(parsed)) {
      throw ProtocolError.requestInvalid("query parameter 'request' must be a JSON object", undefined, headerTraceId);
    }
    return parsed as ResourceRequestMap[K];
  }

  const schemaVersion = parseSchemaVersionFromQuery(searchParams, options, headerTraceId);
  const parsedContext = parseJsonQueryParam<Record<string, unknown>>(searchParams, "context", options, headerTraceId) ?? {};
  const queryTraceId = parseOptionalString(searchParams.get("traceID"));
  if (queryTraceId) {
    parsedContext.traceID = queryTraceId;
  }

  const context = Object.keys(parsedContext).length > 0 ? parsedContext : undefined;
  const experimental = parseJsonQueryParam<unknown[]>(searchParams, "experimental", options, headerTraceId);

  switch (resource) {
    case "catalog": {
      const query = parseOptionalString(searchParams.get("query"));
      const page = parsePageFromQuery(searchParams, options, headerTraceId);
      const sort = parseSortFromQuery(searchParams, options, headerTraceId);
      const filters = parseJsonQueryParam<unknown[]>(searchParams, "filters", options, headerTraceId);

      return {
        schemaVersion,
        catalogID: searchParams.get("catalogID") ?? "",
        mediaType: searchParams.get("mediaType") ?? "",
        ...(query !== undefined ? { query } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(sort !== undefined ? { sort } : {}),
        ...(filters !== undefined ? { filters } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "meta":
      return {
        schemaVersion,
        mediaType: searchParams.get("mediaType") ?? "",
        itemID: searchParams.get("itemID") ?? "",
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    case "stream": {
      const videoID = parseOptionalString(searchParams.get("videoID"));
      const playback = parseJsonQueryParam<Record<string, unknown>>(searchParams, "playback", options, headerTraceId);

      return {
        schemaVersion,
        mediaType: searchParams.get("mediaType") ?? "",
        itemID: searchParams.get("itemID") ?? "",
        ...(videoID !== undefined ? { videoID } : {}),
        ...(playback !== undefined ? { playback } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "subtitles": {
      const videoFingerprint = parseJsonQueryParam<Record<string, unknown>>(
        searchParams,
        "videoFingerprint",
        options,
        headerTraceId,
      );
      const languagePreferences = parseStringListQuery(searchParams, "languagePreferences");

      return {
        schemaVersion,
        mediaType: searchParams.get("mediaType") ?? "",
        itemID: searchParams.get("itemID") ?? "",
        ...(videoFingerprint !== undefined ? { videoFingerprint } : {}),
        ...(languagePreferences !== undefined ? { languagePreferences } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    case "plugin_catalog": {
      const query = parseOptionalString(searchParams.get("query"));
      const page = parsePageFromQuery(searchParams, options, headerTraceId);

      return {
        schemaVersion,
        catalogID: searchParams.get("catalogID") ?? "",
        pluginKind: searchParams.get("pluginKind") ?? "",
        ...(query !== undefined ? { query } : {}),
        ...(page !== undefined ? { page } : {}),
        ...(context !== undefined ? { context } : {}),
        ...(experimental !== undefined ? { experimental } : {}),
      } as ResourceRequestMap[K];
    }
    default:
      throw ProtocolError.requestInvalid(`Unsupported resource '${String(resource)}'`, undefined, headerTraceId);
  }
}

function buildTraceId(headerTraceId: string | undefined, requestBody: unknown): string {
  if (headerTraceId && headerTraceId.trim().length > 0) {
    return headerTraceId;
  }

  if (
    typeof requestBody === "object" &&
    requestBody !== null &&
    "context" in requestBody &&
    typeof (requestBody as { context?: { traceID?: string } }).context?.traceID === "string" &&
    (requestBody as { context?: { traceID?: string } }).context?.traceID?.trim().length
  ) {
    return (requestBody as { context?: { traceID?: string } }).context?.traceID as string;
  }

  return randomUUID();
}

function responseMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return TEXT_MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

async function sendStaticFile(filePath: string): Promise<Response> {
  const candidate = path.resolve(filePath);
  const metadata = await stat(candidate);

  if (!metadata.isFile()) {
    throw new Error("not_a_file");
  }

  const content = readFileSync(candidate);
  return new Response(content, {
    status: 200,
    headers: {
      "content-type": responseMimeType(candidate),
      "cache-control": candidate.endsWith(".html") ? "no-cache" : "public, max-age=3600",
    },
  });
}

function setCacheHeaders(response: Record<string, unknown>, headers: Headers): void {
  const cache = response.cache;
  if (!cache || typeof cache !== "object") {
    return;
  }

  const cacheObject = cache as {
    maxAgeSeconds?: unknown;
    staleWhileRevalidateSeconds?: unknown;
    staleIfErrorSeconds?: unknown;
  };

  const directives: string[] = [];

  if (Number.isInteger(cacheObject.maxAgeSeconds)) {
    directives.push(`max-age=${cacheObject.maxAgeSeconds}`);
  }
  if (Number.isInteger(cacheObject.staleWhileRevalidateSeconds)) {
    directives.push(`stale-while-revalidate=${cacheObject.staleWhileRevalidateSeconds}`);
  }
  if (Number.isInteger(cacheObject.staleIfErrorSeconds)) {
    directives.push(`stale-if-error=${cacheObject.staleIfErrorSeconds}`);
  }

  if (directives.length > 0) {
    headers.set("cache-control", `${directives.join(", ")}, public`);
  }
}

function configureFrontend(app: Hono, prefix: string, options: FrontendOptions): void {
  const mountPath = normalizePathPrefix(options.mountPath ?? "/");
  const distPath = options.distPath ?? path.resolve(__dirname, "ui");

  if (!existsSync(distPath)) {
    return;
  }

  const indexPath = path.join(distPath, "index.html");
  const assetsPath = path.join(distPath, "assets");

  const rootRoute = `${prefix}${mountPath}` || "/";
  const rootRouteWithSlash = rootRoute.endsWith("/") ? rootRoute : `${rootRoute}/`;

  app.get(rootRoute, async () => sendStaticFile(indexPath));
  app.get(rootRouteWithSlash, async () => sendStaticFile(indexPath));
  app.get(`${prefix}/assets/*`, async (context) => {
    const file = context.req.path.replace(`${prefix}/assets/`, "");
    const candidate = path.resolve(assetsPath, file);
    if (!candidate.startsWith(assetsPath)) {
      return context.json(ProtocolError.requestInvalid("Invalid asset path").toJSON(), 400);
    }

    try {
      return await sendStaticFile(candidate);
    } catch {
      return context.json({ error: { code: "NO_HANDLER", message: "Asset not found" } }, 404);
    }
  });
}

function normalizeInstaller<TSettings extends Record<string, SettingPrimitive>>(
  plugin: MediaPlugin<TSettings>,
  installerOptions: InstallOptions | boolean | undefined,
): NormalizedInstaller {
  const base = plugin.install ?? {};

  if (installerOptions === false) {
    return {
      enabled: false,
      title: base.title ?? plugin.manifest.plugin.name,
      subtitle: base.subtitle ?? plugin.manifest.plugin.version,
      description:
        base.description ?? plugin.manifest.plugin.description ?? "Install and configure this plugin before adding it to your app.",
      installButtonText: base.installButtonText ?? "Install Addon",
      openManifestButtonText: base.openManifestButtonText ?? "Open Manifest",
      copyManifestButtonText: base.copyManifestButtonText ?? "Copy Manifest URL",
      fields: [],
    };
  }

  const explicit = typeof installerOptions === "object" ? installerOptions : {};
  const fields = explicit.fields ?? base.fields ?? [];

  return {
    enabled: explicit.enabled ?? base.enabled ?? true,
    title: explicit.title ?? base.title ?? plugin.manifest.plugin.name,
    subtitle: explicit.subtitle ?? base.subtitle ?? plugin.manifest.plugin.version,
    description:
      explicit.description ??
      base.description ??
      plugin.manifest.plugin.description ??
      "Install and configure this plugin before adding it to your app.",
    installButtonText: explicit.installButtonText ?? base.installButtonText ?? "Install Addon",
    openManifestButtonText: explicit.openManifestButtonText ?? base.openManifestButtonText ?? "Open Manifest",
    copyManifestButtonText: explicit.copyManifestButtonText ?? base.copyManifestButtonText ?? "Copy Manifest URL",
    fields,
  };
}

function buildStudioConfig(
  prefix: string,
  deepLinkOptions: DeepLinkOptions | undefined,
  installer: NormalizedInstaller,
): {
  manifestPath: string;
  deeplink: {
    enabled: boolean;
    scheme: string;
    manifestPath: string;
  };
  installer: NormalizedInstaller;
} {
  const manifestPath = deepLinkOptions?.manifestPath ?? `${prefix}/manifest.json`;

  return {
    manifestPath,
    deeplink: {
      enabled: deepLinkOptions?.enabled ?? true,
      scheme: deepLinkOptions?.scheme ?? "stremio",
      manifestPath,
    },
    installer,
  };
}

export function createServer<TSettings extends Record<string, SettingPrimitive>>(
  plugin: MediaPlugin<TSettings>,
  options: CreateServerOptions = {},
): Hono {
  const app = new Hono();
  const prefix = normalizePathPrefix(options.basePath);
  const installer = normalizeInstaller(plugin, options.installer);

  if (options.enableCors !== false) {
    app.use(`${prefix || ""}/*`, cors());
  }

  app.onError((error, context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    const normalized = normalizeError(error, traceId);
    context.header("x-trace-id", traceId);
    return context.json(normalized.toJSON(), normalized.status as 400 | 404 | 500);
  });

  app.get(`${prefix}/manifest.json`, (context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    context.header("x-trace-id", traceId);
    return context.json(plugin.manifest, 200);
  });

  app.get(`${prefix}/studio-config.json`, (context) => {
    const traceId = context.req.header("x-trace-id") ?? randomUUID();
    context.header("x-trace-id", traceId);
    return context.json(buildStudioConfig(prefix, options.deeplink, installer), 200);
  });

  for (const resource of resourcePaths) {
    app.get(`${prefix}/${resource}`, async (context) => {
      const searchParams = new URL(context.req.url).searchParams;
      const request = parseRequestFromQuery(resource, searchParams, options, context.req.header("x-trace-id"));
      const traceId = buildTraceId(context.req.header("x-trace-id"), request);

      context.header("x-trace-id", traceId);

      const validRequest = validateRequest(resource, request, plugin.manifest, plugin.index, traceId);
      const settings = parseInstallSettings(installer.fields, searchParams, traceId) as
        | Partial<TSettings>
        | undefined;

      const response = await plugin.handle(resource, validRequest, {
        traceId,
        headers: Object.fromEntries(context.req.raw.headers),
        request: context.req.raw,
        ...(settings ? { settings } : {}),
      });

      const validResponse = validateResponse(resource, response, traceId) as Record<string, unknown>;

      const headers = new Headers({
        "content-type": "application/json; charset=utf-8",
        "x-trace-id": traceId,
      });
      setCacheHeaders(validResponse, headers);

      return new Response(JSON.stringify(validResponse), {
        status: 200,
        headers,
      });
    });
  }

  const frontend =
    options.frontend === false
      ? { enabled: false }
      : typeof options.frontend === "boolean"
        ? { enabled: options.frontend }
        : { enabled: true, ...(options.frontend ?? {}) };

  if (frontend.enabled) {
    configureFrontend(app, prefix, frontend);
  }

  return app;
}
